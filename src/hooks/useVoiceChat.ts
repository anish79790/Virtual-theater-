import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

interface UseVoiceChatParams {
  socketRef: React.RefObject<Socket | null>;
  roomCode: string | null;
  uid: string | null;
}

export function useVoiceChat({ socketRef, roomCode, uid }: UseVoiceChatParams) {
  const [inVoice, setInVoice] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, { pc: RTCPeerConnection; uid: string; audioEl: HTMLAudioElement }>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const inVoiceRef = useRef(false);
  const micMutedRef = useRef(false);

  inVoiceRef.current = inVoice;
  micMutedRef.current = micMuted;

  const cleanupPeer = useCallback((socketId: string) => {
    const entry = peersRef.current.get(socketId);
    if (!entry) return;
    entry.pc.close();
    entry.audioEl.srcObject = null;
    entry.audioEl.remove();
    peersRef.current.delete(socketId);
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId: string, targetUid: string, isInitiator: boolean) => {
      const socket = socketRef.current;
      if (!socket || !localStreamRef.current) return null;

      cleanupPeer(targetSocketId);

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      const initialVol = peerVolumes[targetUid] ?? 1;
      audioEl.volume = initialVol;
      document.body.appendChild(audioEl);

      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });

      pc.ontrack = (event) => {
        if (event.streams[0]) {
          audioEl.srcObject = event.streams[0];
          void audioEl.play().catch(() => {});
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', {
            targetSocketId,
            candidate: event.candidate
          });
        }
      };

      peersRef.current.set(targetSocketId, { pc, uid: targetUid, audioEl });

      if (isInitiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              socket.emit('webrtc:offer', {
                targetSocketId,
                sdp: pc.localDescription
              });
            }
          })
          .catch(() => {});
      }

      return pc;
    },
    [cleanupPeer, peerVolumes, socketRef]
  );

  const leaveVoice = useCallback(() => {
    if (vadIntervalRef.current !== null) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    for (const socketId of Array.from(peersRef.current.keys())) {
      cleanupPeer(socketId);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setInVoice(false);
    setIsSpeaking(false);
    setMicMuted(false);
    socketRef.current?.emit('voice:state', { inVoice: false, micMuted: true, isSpeaking: false });
  }, [cleanupPeer, socketRef]);

  const joinVoice = useCallback(async () => {
    setVoiceError(null);
    if (!roomCode || !uid) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone voice chat is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;
      setInVoice(true);
      setMicMuted(false);
      socketRef.current?.emit('voice:state', { inVoice: true, micMuted: false, isSpeaking: false });

      // Voice activity detection (VAD) for real speaking ring indicators
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let prevSpeaking = false;

        vadIntervalRef.current = window.setInterval(() => {
          if (micMutedRef.current) {
            if (prevSpeaking) {
              prevSpeaking = false;
              setIsSpeaking(false);
              socketRef.current?.emit('voice:state', { isSpeaking: false });
            }
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const speakingNow = avg > 22;
          if (speakingNow !== prevSpeaking) {
            prevSpeaking = speakingNow;
            setIsSpeaking(speakingNow);
            socketRef.current?.emit('voice:state', { isSpeaking: speakingNow });
          }
        }, 250);
      } catch {
        // VAD optional if AudioContext blocked
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied.';
      setVoiceError(msg.includes('Permission') || msg.includes('NotAllowed')
        ? 'Microphone permission denied. Allow mic access to join voice chat.'
        : 'Unable to access microphone.');
    }
  }, [roomCode, socketRef, uid]);

  const toggleVoice = useCallback(() => {
    if (inVoiceRef.current) {
      leaveVoice();
    } else {
      void joinVoice();
    }
  }, [joinVoice, leaveVoice]);

  const toggleMute = useCallback(() => {
    if (!inVoiceRef.current || !localStreamRef.current) {
      void joinVoice();
      return;
    }
    const nextMuted = !micMutedRef.current;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
    if (nextMuted) setIsSpeaking(false);
    socketRef.current?.emit('voice:state', { inVoice: true, micMuted: nextMuted, isSpeaking: false });
  }, [joinVoice, socketRef]);

  const setPeerVolume = useCallback((peerUid: string, volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setPeerVolumes((prev) => ({ ...prev, [peerUid]: clamped }));
    for (const entry of peersRef.current.values()) {
      if (entry.uid === peerUid) {
        entry.audioEl.volume = clamped;
      }
    }
  }, []);

  // Wire Socket.IO WebRTC signaling listeners
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleVoicePeers = (payload: { peers: { uid: string; socketId: string }[] }) => {
      if (!inVoiceRef.current) return;
      payload.peers.forEach((peer) => {
        createPeerConnection(peer.socketId, peer.uid, true);
      });
    };

    const handlePeerLeft = (payload: { socketId: string }) => {
      cleanupPeer(payload.socketId);
    };

    const handleOffer = async (payload: { fromSocketId: string; fromUid: string; sdp: RTCSessionDescriptionInit }) => {
      if (!inVoiceRef.current || !localStreamRef.current) return;
      const pc = createPeerConnection(payload.fromSocketId, payload.fromUid, false);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          targetSocketId: payload.fromSocketId,
          sdp: pc.localDescription
        });
      } catch {
        // Ignore stale signaling
      }
    };

    const handleAnswer = async (payload: { fromSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      const entry = peersRef.current.get(payload.fromSocketId);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } catch {
        // Ignore stale answer
      }
    };

    const handleIce = async (payload: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const entry = peersRef.current.get(payload.fromSocketId);
      if (!entry) return;
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        // Ignore stale ICE candidate
      }
    };

    socket.on('voice:peers', handleVoicePeers);
    socket.on('voice:peerLeft', handlePeerLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIce);

    return () => {
      socket.off('voice:peers', handleVoicePeers);
      socket.off('voice:peerLeft', handlePeerLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIce);
    };
  }, [cleanupPeer, createPeerConnection, socketRef]);

  // Clean up voice chat when leaving a room
  useEffect(() => {
    if (!roomCode && inVoiceRef.current) {
      leaveVoice();
    }
  }, [roomCode, leaveVoice]);

  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [leaveVoice]);

  return {
    inVoice,
    micMuted,
    isSpeaking,
    voiceError,
    peerVolumes,
    toggleVoice,
    joinVoice,
    leaveVoice,
    toggleMute,
    setPeerVolume
  };
}
