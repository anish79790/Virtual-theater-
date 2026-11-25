import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { auth, signInWithGoogle, signOutUser } from './lib/firebase';
import {
  closeRoomInFirestore,
  createCinemaRoom,
  createWatchParty,
  deleteWatchParty,
  ensureUserProfile,
  getCinemaRoomByCode,
  joinCinemaRoomInFirestore,
  leaveRoomInFirestore,
  persistChatMessageToFirestore,
  persistQueueItemToFirestore,
  removeMemberFromFirestore,
  removeQueueItemFromFirestore,
  sanitizeRoomCode,
  subscribeActiveRoom,
  subscribeMyRooms,
  subscribePublicRooms,
  subscribeRecentRooms,
  subscribeRoomMembersByUids,
  subscribeRoomMessages,
  subscribeRoomQueue,
  subscribeWatchParties,
  transferHostInFirestore,
  updateRoomHostSettingsInFirestore,
  updateRoomPlaybackInFirestore,
  updateSeatInFirestore,
  updateUserPreferences
} from './lib/firestoreService';
import { releaseLandscapeCinema, requestLandscapeCinema } from './lib/orientation';
import { useSocketRoom } from './hooks/useSocketRoom';
import { useVoiceChat } from './hooks/useVoiceChat';
import { HomeView } from './components/HomeView';
import { RoomLobbyView } from './components/RoomLobbyView';
import { CinemaAuditoriumView } from './components/CinemaAuditoriumView';
import { SeatSelectorModal } from './components/SeatSelectorModal';
import { WatchQueueModal } from './components/WatchQueueModal';
import {
  CreateRoomModal,
  JoinCodeModal,
  RoomSettingsModal,
  SchedulePartyModal,
  TransferHostBeforeLeaveModal
} from './components/RoomModals';
import {
  getSeatTier,
  type ChatMessage,
  type CinemaRoom,
  type GraphicsQuality,
  type HomeTab,
  type LiveMember,
  type PlaybackState,
  type QueueItem,
  type RecentRoom,
  type RoomSettingsPayload,
  type UserProfile,
  type VideoQuality,
  type WatchParty,
  type WatchSourceMode
} from './types/cinema';

type AppScreen = 'home' | 'lobby' | 'cinema';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState<AppScreen>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>('home');

  const [publicRooms, setPublicRooms] = useState<CinemaRoom[]>([]);
  const [myRooms, setMyRooms] = useState<CinemaRoom[]>([]);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [watchParties, setWatchParties] = useState<WatchParty[]>([]);

  const [activeRoom, setActiveRoom] = useState<CinemaRoom | null>(null);
  const [fsRoom, setFsRoom] = useState<CinemaRoom | null>(null);
  const [fsMembers, setFsMembers] = useState<LiveMember[]>([]);
  const [fsMessages, setFsMessages] = useState<ChatMessage[]>([]);
  const [fsQueue, setFsQueue] = useState<QueueItem[]>([]);
  const [localPlaybackOverride, setLocalPlaybackOverride] = useState<PlaybackState | null>(null);

  const [preferredSourceMode, setPreferredSourceMode] = useState<WatchSourceMode>('youtube');
  const [localBrowserState, setLocalBrowserState] = useState<{ url: string; query: string }>({ url: '', query: '' });
  const [orientationLockFailed, setOrientationLockFailed] = useState(false);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(() => {
    try {
      const saved = window.localStorage.getItem('cinehall_3d_quality');
      if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
    } catch {
      // Ignore storage access restrictions
    }
    return typeof window !== 'undefined' && window.innerWidth < 900 ? 'medium' : 'high';
  });

  const handleChangeGraphicsQuality = useCallback((q: GraphicsQuality) => {
    setGraphicsQuality(q);
    try {
      window.localStorage.setItem('cinehall_3d_quality', q);
    } catch {
      // Ignore storage error
    }
  }, []);

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    return code ? sanitizeRoomCode(code) : null;
  });

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLeaveHostModal, setShowLeaveHostModal] = useState(false);

  const [toast, setToast] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const isLeavingRef = useRef(false);
  const seekWriteTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, type: 'info' | 'error' = 'info') => {
    setToast({ text, type });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setAuthLoading(false);
        return;
      }
      try {
        const profile = await ensureUserProfile(fbUser);
        setUser(profile);
      } catch (err) {
        console.error('Failed to initialize user profile:', err);
        setUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName || 'Cinema Guest',
          photoURL: fbUser.photoURL || '',
          preferredSeat: 'B3',
          email: fbUser.email || '',
          notificationsEnabled: true,
          autoLandscape: true
        });
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Firestore Home Subscriptions (only when signed in)
  useEffect(() => {
    if (!user) {
      setPublicRooms([]);
      setMyRooms([]);
      setRecentRooms([]);
      setWatchParties([]);
      return;
    }

    const unsubPublic = subscribePublicRooms(setPublicRooms, (e) => console.error('Public rooms sync error:', e));
    const unsubMy = subscribeMyRooms(user.uid, setMyRooms, (e) => console.error('My rooms sync error:', e));
    const unsubRecent = subscribeRecentRooms(user.uid, setRecentRooms, (e) => console.error('Recent rooms sync error:', e));
    const unsubParties = subscribeWatchParties(setWatchParties, (e) => console.error('Watch parties sync error:', e));

    return () => {
      unsubPublic();
      unsubMy();
      unsubRecent();
      unsubParties();
    };
  }, [user]);

  const handleRoomForceExit = useCallback(
    (reason: string) => {
      releaseLandscapeCinema();
      setOrientationLockFailed(false);
      setShowLeaveHostModal(false);
      setActiveRoom(null);
      setFsRoom(null);
      setFsMembers([]);
      setFsMessages([]);
      setFsQueue([]);
      setLocalPlaybackOverride(null);
      setScreen('home');
      window.history.replaceState({}, '', '/');
      showToast(reason, 'error');
    },
    [showToast]
  );

  // Real-Time Firestore Subscription to Active Room Document (Syncs members, host, playback across ALL devices & server instances!)
  useEffect(() => {
    if (!activeRoom || !user) {
      setFsRoom(null);
      setFsMembers([]);
      setFsMessages([]);
      setFsQueue([]);
      setLocalPlaybackOverride(null);
      return;
    }

    isLeavingRef.current = false;
    let seenSelfInMembers = false;

    const unsubRoom = subscribeActiveRoom(
      activeRoom.code,
      (roomDoc) => {
        if (isLeavingRef.current) return;
        if (!roomDoc || roomDoc.status === 'closed') {
          handleRoomForceExit('This cinema room was closed by the host.');
          return;
        }
        const memberUids = Array.isArray(roomDoc.memberUids) ? roomDoc.memberUids : [];
        if (memberUids.includes(user.uid)) {
          seenSelfInMembers = true;
        } else if (seenSelfInMembers && roomDoc.hostId !== user.uid) {
          handleRoomForceExit('You were removed from the cinema room by the host.');
          return;
        }
        setFsRoom(roomDoc);
      },
      (err) => console.error('Active room Firestore sync error:', err)
    );

    return () => {
      unsubRoom();
    };
  }, [activeRoom?.code, user, handleRoomForceExit]);

  // Real-Time Firestore Subscription to ALL Room Members (works for BOTH private & public rooms via single-doc get listeners!)
  const memberUidsKey = (fsRoom?.memberUids || activeRoom?.memberUids || []).join(',');
  useEffect(() => {
    if (!activeRoom || !user) {
      setFsMembers([]);
      return;
    }
    const uids = memberUidsKey ? memberUidsKey.split(',').filter(Boolean) : [user.uid];
    const unsubMembers = subscribeRoomMembersByUids(
      activeRoom.code,
      uids,
      setFsMembers,
      (err) => console.error('Room members Firestore sync error:', err)
    );
    return () => unsubMembers();
  }, [activeRoom?.code, memberUidsKey, user]);

  // Real-Time Firestore Subscription to Room Chat & Queue (cross-instance sync for BOTH private & public rooms!)
  const activeIsPublic = fsRoom ? fsRoom.isPublic : Boolean(activeRoom?.isPublic);
  useEffect(() => {
    if (!activeRoom || !user) {
      setFsMessages([]);
      setFsQueue([]);
      return;
    }
    const unsubMsgs = subscribeRoomMessages(
      activeRoom.code,
      user.uid,
      activeIsPublic,
      setFsMessages,
      (err) => console.error('Room messages Firestore sync error:', err)
    );
    const unsubQueue = subscribeRoomQueue(
      activeRoom.code,
      user.uid,
      activeIsPublic,
      setFsQueue,
      (err) => console.error('Room queue Firestore sync error:', err)
    );
    return () => {
      unsubMsgs();
      unsubQueue();
    };
  }, [activeRoom?.code, activeIsPublic, user]);

  // Socket.IO Real-Time Cinema Synchronization (ultra-low-latency events, typing, reactions, WebRTC signaling)
  const socketState = useSocketRoom({
    user,
    activeRoom,
    onKicked: () => handleRoomForceExit('You were removed from the cinema room by the host.'),
    onRoomClosed: () => handleRoomForceExit('This cinema room was closed by the host.')
  });

  // Real WebRTC Voice Chat
  const voice = useVoiceChat({
    socketRef: socketState.socketRef,
    roomCode: activeRoom?.code || null,
    uid: user?.uid || null
  });

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled.';
      if (!msg.includes('popup-closed-by-user')) {
        showToast('Could not complete Google Sign-In. Please try again.', 'error');
      }
    }
  }, [showToast]);

  const requireAuth = useCallback(
    async (action: () => void) => {
      if (user) {
        action();
        return;
      }
      try {
        await signInWithGoogle();
        action();
      } catch {
        showToast('Sign in with Google to create or join a cinema room.', 'error');
      }
    },
    [user, showToast]
  );

  const handleJoinRoomByCode = useCallback(
    async (rawCode: string) => {
      if (!user) {
        setPendingInviteCode(sanitizeRoomCode(rawCode));
        await handleSignIn();
        return;
      }
      const code = sanitizeRoomCode(rawCode);
      if (code.length !== 6) {
        showToast('Enter a valid 6-character room code.', 'error');
        return;
      }
      const found = await getCinemaRoomByCode(code);
      if (!found) {
        throw new Error(`No cinema room found with code ${code}.`);
      }
      if (found.status === 'closed') {
        throw new Error(`Room ${code} has already been closed by the host.`);
      }
      const joined = await joinCinemaRoomInFirestore(found, user);
      setLocalPlaybackOverride(null);
      setPreferredSourceMode(joined.sourceMode || 'youtube');
      setLocalBrowserState({ url: joined.browserUrl || '', query: joined.browserQuery || '' });
      setActiveRoom(joined);
      setScreen('lobby');
      window.history.replaceState({}, '', `/?room=${joined.code}`);
    },
    [user, handleSignIn, showToast]
  );

  // Auto-join ?room=CODE invite links once signed in
  useEffect(() => {
    if (!authLoading && user && pendingInviteCode && !activeRoom) {
      const code = pendingInviteCode;
      setPendingInviteCode(null);
      void handleJoinRoomByCode(code).catch((err) => {
        showToast(err instanceof Error ? err.message : 'Unable to join invited room.', 'error');
        window.history.replaceState({}, '', '/');
      });
    }
  }, [authLoading, user, pendingInviteCode, activeRoom, handleJoinRoomByCode, showToast]);

  const handleCreateRoom = async (params: {
    name: string;
    isPublic: boolean;
    sourceMode: WatchSourceMode;
    videoId: string;
    videoTitle: string;
    videoQuality: VideoQuality;
    voiceChatEnabled: boolean;
  }) => {
    if (!user) throw new Error('Sign in required to create a room.');
    const created = await createCinemaRoom({
      name: params.name,
      isPublic: params.isPublic,
      sourceMode: params.sourceMode,
      videoId: params.videoId,
      videoTitle: params.videoTitle,
      videoQuality: params.videoQuality,
      voiceChatEnabled: params.voiceChatEnabled,
      user
    });
    setLocalPlaybackOverride(null);
    setPreferredSourceMode(params.sourceMode);
    setLocalBrowserState({ url: '', query: '' });
    setActiveRoom(created);
    setScreen('lobby');
    window.history.replaceState({}, '', `/?room=${created.code}`);
    showToast(`Room ${created.code} is ready!`);
  };

  const handleScheduleParty = async (params: {
    title: string;
    videoId: string;
    videoTitle: string;
    scheduledFor: string;
    isPublic: boolean;
  }) => {
    if (!user) throw new Error('Sign in required to schedule a watch party.');
    const createdRoom = await createCinemaRoom({
      name: params.title,
      isPublic: params.isPublic,
      videoId: params.videoId,
      videoTitle: params.videoTitle,
      videoQuality: 'hd1080',
      voiceChatEnabled: true,
      user
    });
    await createWatchParty({
      title: params.title,
      roomCode: createdRoom.code,
      videoId: params.videoId,
      videoTitle: params.videoTitle,
      scheduledFor: params.scheduledFor,
      isPublic: params.isPublic,
      user
    });
    showToast(`Scheduled "${params.title}" (Code: ${createdRoom.code})`);
  };

  const handleUpdateProfile = async (updates: {
    displayName?: string;
    preferredSeat?: string;
    notificationsEnabled?: boolean;
    autoLandscape?: boolean;
  }) => {
    if (!user) return;
    await updateUserPreferences(user.uid, updates);
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  // === Hybrid Derived Live State (Firestore + Socket.IO Merged Authoritatively) ===
  const snapshot = socketState.roomSnapshot;
  const effectiveRoomName = fsRoom?.name || snapshot?.name || activeRoom?.name || 'Cinema Hall';
  const effectiveHostId = fsRoom?.hostId || snapshot?.hostId || activeRoom?.hostId || '';
  const effectiveIsPublic = fsRoom ? fsRoom.isPublic : snapshot ? snapshot.isPublic : Boolean(activeRoom?.isPublic);
  const isHost = Boolean(user && effectiveHostId === user.uid);

  // Merge Firestore members + Socket.IO live members so EVERY connected member across ANY device/instance is always visible!
  const effectiveMembers: LiveMember[] = useMemo(() => {
    const map = new Map<string, LiveMember>();
    const activeUidSet =
      fsRoom && Array.isArray(fsRoom.memberUids) && fsRoom.memberUids.length > 0
        ? new Set(fsRoom.memberUids)
        : null;

    for (const m of fsMembers) {
      map.set(m.uid, m);
    }

    if (snapshot?.members) {
      for (const sm of snapshot.members) {
        // Respect Firestore removals if member already left cleanly
        if (activeUidSet && !activeUidSet.has(sm.uid) && fsMembers.length > 0) continue;
        const existing = map.get(sm.uid);
        if (existing) {
          map.set(sm.uid, {
            ...existing,
            socketId: sm.socketId || existing.socketId,
            displayName: existing.displayName || sm.displayName,
            photoURL: existing.photoURL || sm.photoURL,
            seatId: sm.seatId || existing.seatId,
            seatTier: sm.seatTier || existing.seatTier,
            isOnline: true,
            inVoice: sm.inVoice,
            micMuted: sm.micMuted,
            isSpeaking: sm.isSpeaking
          });
        } else {
          map.set(sm.uid, sm);
        }
      }
    }

    // Guarantee current signed-in user appears immediately while initial Firestore snapshot hydrates
    if (user && activeRoom && !map.has(user.uid)) {
      const seatId = /^[A-C][1-8]$/.test(user.preferredSeat) ? user.preferredSeat : 'B3';
      map.set(user.uid, {
        uid: user.uid,
        socketId: '',
        displayName: user.displayName,
        photoURL: user.photoURL,
        seatId,
        seatTier: getSeatTier(seatId),
        isOnline: true,
        inVoice: false,
        micMuted: true,
        isSpeaking: false,
        joinedAt: Date.now()
      });
    }

    return Array.from(map.values()).sort((a, b) => a.joinedAt - b.joinedAt);
  }, [fsRoom, fsMembers, snapshot?.members, user, activeRoom]);

  // Merge Firestore + Socket.IO messages (deduplicated by id)
  const effectiveMessages: ChatMessage[] = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of fsMessages) map.set(m.id, m);
    if (snapshot?.messages) {
      for (const sm of snapshot.messages) {
        if (!map.has(sm.id)) map.set(sm.id, sm);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-100);
  }, [fsMessages, snapshot?.messages]);

  // Merge Firestore + Socket.IO watch queue (deduplicated by id)
  const effectiveQueue: QueueItem[] = useMemo(() => {
    const map = new Map<string, QueueItem>();
    for (const q of fsQueue) map.set(q.id, q);
    if (snapshot?.queue) {
      for (const sq of snapshot.queue) {
        map.set(sq.id, sq);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [fsQueue, snapshot?.queue]);

  // Construct Firestore PlaybackState
  const fsPlayback: PlaybackState | null = useMemo(() => {
    if (!fsRoom) return null;
    return {
      videoId: fsRoom.currentVideoId || 'eRsGyueVLvQ',
      videoTitle: fsRoom.currentVideoTitle || 'Cinema Feature',
      isPlaying: Boolean(fsRoom.isPlaying),
      position: typeof fsRoom.playbackPosition === 'number' ? fsRoom.playbackPosition : 0,
      updatedAt: typeof fsRoom.playbackUpdatedAt === 'number' ? fsRoom.playbackUpdatedAt : 0,
      playbackRate: 1,
      quality: fsRoom.videoQuality || 'hd1080',
      syncEnabled: fsRoom.syncEnabled !== false,
      sourceMode: fsRoom.sourceMode || 'youtube',
      browserUrl: fsRoom.browserUrl || '',
      browserQuery: fsRoom.browserQuery || ''
    };
  }, [fsRoom]);

  // Pick the newest authoritative PlaybackState among Firestore, Socket.IO, and Host's immediate local action
  const effectivePlayback: PlaybackState = useMemo(() => {
    const candidates: PlaybackState[] = [];
    if (fsPlayback) candidates.push(fsPlayback);
    if (snapshot?.playback) candidates.push(snapshot.playback);
    if (localPlaybackOverride && isHost) candidates.push(localPlaybackOverride);

    if (candidates.length === 0) {
      return {
        videoId: activeRoom?.currentVideoId || 'eRsGyueVLvQ',
        videoTitle: activeRoom?.currentVideoTitle || 'Cinema Feature',
        isPlaying: Boolean(activeRoom?.isPlaying),
        position: activeRoom?.playbackPosition || 0,
        updatedAt: activeRoom?.playbackUpdatedAt || Date.now(),
        playbackRate: 1,
        quality: activeRoom?.videoQuality || 'hd1080',
        syncEnabled: activeRoom?.syncEnabled !== false,
        sourceMode: preferredSourceMode,
        browserUrl: localBrowserState.url,
        browserQuery: localBrowserState.query
      };
    }

    candidates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const winner = candidates[0];
    return {
      ...winner,
      sourceMode: winner.sourceMode || preferredSourceMode,
      browserUrl: winner.browserUrl ?? localBrowserState.url,
      browserQuery: winner.browserQuery ?? localBrowserState.query
    };
  }, [fsPlayback, snapshot?.playback, localPlaybackOverride, isHost, activeRoom, preferredSourceMode, localBrowserState]);

  // Sync host sourceMode broadcasts into local mode cleanly
  const lastRemoteSourceModeRef = useRef<WatchSourceMode | undefined>(undefined);
  useEffect(() => {
    const remoteMode = effectivePlayback.sourceMode;
    if (!remoteMode) return;
    if (lastRemoteSourceModeRef.current !== remoteMode) {
      lastRemoteSourceModeRef.current = remoteMode;
      setPreferredSourceMode(remoteMode);
    }
  }, [effectivePlayback.sourceMode]);

  // Notify viewer if they became the new Host!
  const prevHostIdRef = useRef<string>('');
  useEffect(() => {
    if (!effectiveHostId || !user) {
      prevHostIdRef.current = '';
      return;
    }
    if (prevHostIdRef.current && prevHostIdRef.current !== effectiveHostId) {
      if (effectiveHostId === user.uid) {
        showToast('You are now the Cinema Host! You control playback.');
      } else {
        const newHost = effectiveMembers.find((m) => m.uid === effectiveHostId);
        if (newHost) {
          showToast(`${newHost.displayName} is now the Cinema Host.`);
        }
      }
    }
    prevHostIdRef.current = effectiveHostId;
  }, [effectiveHostId, user, effectiveMembers, showToast]);

  const mySeatId = effectiveMembers.find((m) => m.uid === user?.uid)?.seatId || user?.preferredSeat || 'B3';

  const handleSelectSeat = (seatId: string) => {
    if (!activeRoom || !user) return;
    socketState.selectSeat(seatId);
    void updateSeatInFirestore(activeRoom.code, user.uid, seatId).catch(() => {});
  };

  const handleHostPlaybackControl = (payload: {
    action: 'play' | 'pause' | 'seek' | 'videoChange' | 'qualityChange' | 'sourceChange' | 'browserNavigate';
    position?: number;
    videoId?: string;
    videoTitle?: string;
    quality?: VideoQuality;
    sourceMode?: WatchSourceMode;
    browserUrl?: string;
    browserQuery?: string;
  }) => {
    if (!activeRoom || !isHost) return;

    const now = Date.now();
    socketState.emitPlaybackControl(payload);

    // Apply optimistic local state for 0ms Host responsiveness & broadcast authoritatively via Firestore
    const base = effectivePlayback;
    let nextState: PlaybackState = { ...base, updatedAt: now };
    const fsPayload: Parameters<typeof updateRoomPlaybackInFirestore>[1] = { playbackUpdatedAt: now };

    switch (payload.action) {
      case 'play': {
        const pos = typeof payload.position === 'number' ? payload.position : base.position;
        nextState = { ...base, isPlaying: true, position: pos, updatedAt: now };
        fsPayload.isPlaying = true;
        fsPayload.playbackPosition = pos;
        break;
      }
      case 'pause': {
        const pos = typeof payload.position === 'number' ? payload.position : base.position;
        nextState = { ...base, isPlaying: false, position: pos, updatedAt: now };
        fsPayload.isPlaying = false;
        fsPayload.playbackPosition = pos;
        break;
      }
      case 'seek': {
        const pos = typeof payload.position === 'number' ? payload.position : base.position;
        nextState = { ...base, position: pos, updatedAt: now };
        fsPayload.playbackPosition = pos;
        break;
      }
      case 'videoChange': {
        if (!payload.videoId) return;
        const title = payload.videoTitle || `YouTube Video (${payload.videoId})`;
        nextState = {
          ...base,
          sourceMode: 'youtube',
          videoId: payload.videoId,
          videoTitle: title,
          position: 0,
          isPlaying: true,
          updatedAt: now
        };
        fsPayload.sourceMode = 'youtube';
        fsPayload.currentVideoId = payload.videoId;
        fsPayload.currentVideoTitle = title;
        fsPayload.playbackPosition = 0;
        fsPayload.isPlaying = true;
        break;
      }
      case 'qualityChange': {
        if (!payload.quality) return;
        nextState = { ...base, quality: payload.quality, updatedAt: now };
        fsPayload.videoQuality = payload.quality;
        break;
      }
      case 'sourceChange': {
        const mode = payload.sourceMode === 'browser' ? 'browser' : 'youtube';
        nextState = { ...base, sourceMode: mode, updatedAt: now };
        fsPayload.sourceMode = mode;
        break;
      }
      case 'browserNavigate': {
        const url = payload.browserUrl || '';
        const query = payload.browserQuery || '';
        nextState = { ...base, sourceMode: 'browser', browserUrl: url, browserQuery: query, updatedAt: now };
        fsPayload.sourceMode = 'browser';
        fsPayload.browserUrl = url;
        fsPayload.browserQuery = query;
        break;
      }
    }

    setLocalPlaybackOverride(nextState);

    if (payload.action === 'seek') {
      if (seekWriteTimerRef.current) window.clearTimeout(seekWriteTimerRef.current);
      seekWriteTimerRef.current = window.setTimeout(() => {
        void updateRoomPlaybackInFirestore(activeRoom.code, fsPayload).catch(() => {});
      }, 180);
    } else {
      void updateRoomPlaybackInFirestore(activeRoom.code, fsPayload).catch(() => {});
    }
  };

  const handleChangeSourceMode = (mode: WatchSourceMode, videoId?: string, videoTitle?: string) => {
    setPreferredSourceMode(mode);
    if (isHost) {
      handleHostPlaybackControl({ action: 'sourceChange', sourceMode: mode });
      if (mode === 'youtube' && videoId) {
        handleHostPlaybackControl({
          action: 'videoChange',
          videoId,
          videoTitle: videoTitle || `YouTube Video (${videoId})`
        });
      }
    }
  };

  const handleBrowserNavigate = (url: string, query: string) => {
    setLocalBrowserState({ url, query });
    if (isHost) {
      handleHostPlaybackControl({
        action: 'browserNavigate',
        browserUrl: url,
        browserQuery: query
      });
    }
  };

  const handleChangeVideo = (videoId: string, title: string) => {
    if (!isHost) {
      showToast('Only the Host can change the cinema video.', 'error');
      return;
    }
    setPreferredSourceMode('youtube');
    handleHostPlaybackControl({ action: 'videoChange', videoId, videoTitle: title });
    showToast(`Loaded "${title}"`);
  };

  const currentVisibleUids = useMemo(() => {
    const set = new Set<string>();
    if (user?.uid) set.add(user.uid);
    if (fsRoom?.memberUids) {
      for (const uid of fsRoom.memberUids) set.add(uid);
    }
    for (const m of effectiveMembers) set.add(m.uid);
    return Array.from(set).slice(0, 24);
  }, [user?.uid, fsRoom?.memberUids, effectiveMembers]);

  const handleAddQueueVideo = async (videoId: string, title: string) => {
    if (!activeRoom || !user) return;
    const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socketState.addQueueItem({ id, videoId, title });
    const nextOrder = effectiveQueue.length > 0 ? Math.max(...effectiveQueue.map((q) => q.order)) + 1 : 1;
    void persistQueueItemToFirestore(
      activeRoom.code,
      {
        id,
        roomId: activeRoom.code,
        videoId,
        title,
        addedByUid: user.uid,
        addedByName: user.displayName,
        order: nextOrder,
        status: isHost ? 'approved' : 'pending',
        isPublicRoom: effectiveIsPublic
      },
      currentVisibleUids
    ).catch(() => {});
  };

  const handleRemoveQueueItem = (itemId: string) => {
    if (!activeRoom) return;
    socketState.removeQueueItem(itemId);
    void removeQueueItemFromFirestore(activeRoom.code, itemId).catch(() => {});
  };

  const handlePlayNextInQueue = (specificItemId?: string) => {
    if (!activeRoom || !isHost) return;
    const target = specificItemId
      ? effectiveQueue.find((q) => q.id === specificItemId)
      : effectiveQueue.find((q) => q.status === 'approved') || effectiveQueue[0];
    socketState.playNextInQueue(specificItemId);
    if (target) {
      handleHostPlaybackControl({
        action: 'videoChange',
        videoId: target.videoId,
        videoTitle: target.title
      });
      void removeQueueItemFromFirestore(activeRoom.code, target.id).catch(() => {});
    }
  };

  const handleSendChat = (text: string) => {
    if (!activeRoom || !user) return;
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socketState.sendChatMessage(text, id);
    void persistChatMessageToFirestore(
      activeRoom.code,
      {
        id,
        roomId: activeRoom.code,
        senderUid: user.uid,
        senderName: user.displayName,
        senderAvatar: user.photoURL,
        text,
        timestamp: Date.now()
      },
      effectiveIsPublic,
      currentVisibleUids
    ).catch(() => {});
  };

  const handleSaveRoomSettings = (payload: RoomSettingsPayload) => {
    if (!activeRoom || !isHost) return;
    socketState.emitSettingsUpdate(payload);
    setActiveRoom((prev) =>
      prev
        ? {
            ...prev,
            name: payload.name ?? prev.name,
            isPublic: payload.isPublic ?? prev.isPublic,
            videoQuality: payload.videoQuality ?? prev.videoQuality,
            syncEnabled: payload.syncEnabled ?? prev.syncEnabled,
            voiceChatEnabled: payload.voiceChatEnabled ?? prev.voiceChatEnabled
          }
        : prev
    );
    void updateRoomHostSettingsInFirestore(activeRoom.code, payload).catch(() => {});
    showToast('Room settings updated');
  };

  const handleTransferHost = (member: LiveMember) => {
    if (!activeRoom || !isHost) return;
    socketState.emitTransferHost(member.uid);
    void transferHostInFirestore(activeRoom.code, member.uid, member.displayName).catch(() => {});
    showToast(`Transferred host role to ${member.displayName}`);
  };

  const handleKickMember = (member: LiveMember) => {
    if (!activeRoom || !isHost) return;
    socketState.emitKickMember(member.uid);
    void removeMemberFromFirestore(fsRoom || activeRoom, member.uid).catch(() => {});
    showToast(`Removed ${member.displayName} from room`);
  };

  const handleCloseRoom = () => {
    if (!activeRoom || !isHost) return;
    isLeavingRef.current = true;
    setShowLeaveHostModal(false);
    releaseLandscapeCinema();
    setOrientationLockFailed(false);
    voice.leaveVoice();
    socketState.emitCloseRoom();
    void closeRoomInFirestore(activeRoom.code).catch(() => {});
    setActiveRoom(null);
    setFsRoom(null);
    setFsMembers([]);
    setFsMessages([]);
    setFsQueue([]);
    setLocalPlaybackOverride(null);
    setScreen('home');
    window.history.replaceState({}, '', '/');
    showToast('Cinema room closed');
  };

  const performLeaveRoom = useCallback(
    (skipFirestoreLeave = false) => {
      const code = activeRoom?.code;
      const uid = user?.uid;
      isLeavingRef.current = true;
      setShowLeaveHostModal(false);
      releaseLandscapeCinema();
      setOrientationLockFailed(false);
      voice.leaveVoice();
      socketState.leaveSocketRoom();
      if (!skipFirestoreLeave && code && uid) {
        void leaveRoomInFirestore(code, uid).catch(() => {});
      }
      setActiveRoom(null);
      setFsRoom(null);
      setFsMembers([]);
      setFsMessages([]);
      setFsQueue([]);
      setLocalPlaybackOverride(null);
      setScreen('home');
      window.history.replaceState({}, '', '/');
    },
    [activeRoom?.code, user?.uid, voice, socketState]
  );

  // Mandatory Host Handoff: if Host tries to leave while other members are in the room, prompt to pass Host first!
  const handleLeaveRoom = useCallback(() => {
    if (!activeRoom || !user) {
      performLeaveRoom();
      return;
    }
    const otherMembers = effectiveMembers.filter((m) => m.uid !== user.uid);
    if (isHost && otherMembers.length > 0) {
      setShowLeaveHostModal(true);
      return;
    }
    performLeaveRoom();
  }, [activeRoom, user, effectiveMembers, isHost, performLeaveRoom]);

  const handleTransferHostAndLeave = async (nextHost: LiveMember) => {
    if (!activeRoom || !user) return;
    isLeavingRef.current = true;
    try {
      socketState.emitTransferHost(nextHost.uid);
      await transferHostInFirestore(activeRoom.code, nextHost.uid, nextHost.displayName);
      await leaveRoomInFirestore(activeRoom.code, user.uid);
      performLeaveRoom(true);
      showToast(`Passed Host to ${nextHost.displayName} and left the room.`);
    } catch {
      isLeavingRef.current = false;
      showToast('Could not transfer host right now. Please try again.', 'error');
    }
  };

  const handleEnterCinema = () => {
    const wantsAutoLandscape = user?.autoLandscape !== false;
    setOrientationLockFailed(false);
    // Request actual fullscreen + real Screen Orientation API landscape lock synchronously from this click gesture
    void requestLandscapeCinema(wantsAutoLandscape).then((result) => {
      if (wantsAutoLandscape && !result.orientationLocked) {
        setOrientationLockFailed(true);
      }
    });
    if (isHost && preferredSourceMode === 'browser') {
      handleHostPlaybackControl({ action: 'sourceChange', sourceMode: 'browser' });
    }
    setScreen('cinema');
  };

  const handleRetryLandscapeLock = async () => {
    const result = await requestLandscapeCinema(true);
    setOrientationLockFailed(!result.orientationLocked);
  };

  const handleExitCinema = () => {
    releaseLandscapeCinema();
    setOrientationLockFailed(false);
    setScreen('lobby');
  };

  return (
    <>
      {screen === 'home' && (
        <HomeView
          user={user}
          authLoading={authLoading}
          activeTab={homeTab}
          onChangeTab={setHomeTab}
          publicRooms={publicRooms}
          myRooms={myRooms}
          recentRooms={recentRooms}
          watchParties={watchParties}
          roomOnlineCounts={socketState.roomOnlineCounts}
          onlineUsers={socketState.onlineUsers}
          notifications={socketState.notifications}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void signOutUser()}
          onOpenCreateRoom={() => void requireAuth(() => setShowCreateModal(true))}
          onOpenJoinCode={() => void requireAuth(() => setShowJoinModal(true))}
          onOpenScheduleParty={() => void requireAuth(() => setShowScheduleModal(true))}
          onJoinRoomCode={(code) => {
            void handleJoinRoomByCode(code).catch((err) => {
              showToast(err instanceof Error ? err.message : 'Unable to join room.', 'error');
            });
          }}
          onDeleteWatchParty={(id) => {
            void deleteWatchParty(id)
              .then(() => showToast('Watch party cancelled'))
              .catch(() => showToast('Could not delete watch party', 'error'));
          }}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

      {screen === 'lobby' && activeRoom && user && (
        <RoomLobbyView
          room={{ ...activeRoom, name: effectiveRoomName, isPublic: effectiveIsPublic }}
          user={user}
          members={effectiveMembers}
          queue={effectiveQueue}
          hostId={effectiveHostId}
          sourceMode={effectivePlayback.sourceMode || preferredSourceMode}
          videoId={effectivePlayback.videoId}
          videoTitle={effectivePlayback.videoTitle}
          videoQuality={effectivePlayback.quality}
          syncEnabled={effectivePlayback.syncEnabled}
          inVoice={voice.inVoice}
          micMuted={voice.micMuted}
          connectionStatus={socketState.connectionStatus}
          onBack={handleLeaveRoom}
          onEnterCinema={handleEnterCinema}
          onOpenSeatSelector={() => setShowSeatModal(true)}
          onOpenWatchQueue={() => setShowQueueModal(true)}
          onOpenRoomSettings={() => setShowSettingsModal(true)}
          onToggleVoice={voice.toggleVoice}
          onChangeSourceMode={(mode) => handleChangeSourceMode(mode)}
          onChangeVideo={handleChangeVideo}
          onLeaveRoom={handleLeaveRoom}
        />
      )}

      {screen === 'cinema' && activeRoom && user && (
        <CinemaAuditoriumView
          roomName={effectiveRoomName}
          roomCode={activeRoom.code}
          user={user}
          hostId={effectiveHostId}
          mySeatId={mySeatId}
          members={effectiveMembers}
          playback={effectivePlayback}
          queue={effectiveQueue}
          messages={effectiveMessages}
          typingUsers={socketState.typingUsers}
          floatingReactions={socketState.floatingReactions}
          autoLandscape={user.autoLandscape !== false}
          orientationLockFailed={orientationLockFailed}
          graphicsQuality={graphicsQuality}
          inVoice={voice.inVoice}
          micMuted={voice.micMuted}
          onToggleVoice={voice.toggleVoice}
          onToggleMute={voice.toggleMute}
          onChangeGraphicsQuality={handleChangeGraphicsQuality}
          onOpenSeatSelector={() => setShowSeatModal(true)}
          onRetryLandscapeLock={handleRetryLandscapeLock}
          onExitCinema={handleExitCinema}
          onHostPlaybackControl={handleHostPlaybackControl}
          onChangeSourceMode={handleChangeSourceMode}
          onBrowserNavigate={handleBrowserNavigate}
          onRequestSync={socketState.requestPlaybackSync}
          onPlayNextInQueue={() => handlePlayNextInQueue()}
          onSendChat={handleSendChat}
          onTyping={socketState.emitTyping}
          onSendReaction={socketState.sendReaction}
          onOpenWatchQueue={() => setShowQueueModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onTransferHost={handleTransferHost}
          onKickMember={handleKickMember}
        />
      )}

      {/* === Shared Modals === */}
      <CreateRoomModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateRoom}
      />

      <JoinCodeModal
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoin={handleJoinRoomByCode}
      />

      <SchedulePartyModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={handleScheduleParty}
      />

      {activeRoom && user && (
        <>
          <SeatSelectorModal
            open={showSeatModal}
            onClose={() => setShowSeatModal(false)}
            members={effectiveMembers}
            currentUid={user.uid}
            hostId={effectiveHostId}
            selectedSeatId={mySeatId}
            onSelectSeat={handleSelectSeat}
          />

          <WatchQueueModal
            open={showQueueModal}
            onClose={() => setShowQueueModal(false)}
            queue={effectiveQueue}
            isHost={isHost}
            currentUid={user.uid}
            onAddVideo={handleAddQueueVideo}
            onRemoveItem={handleRemoveQueueItem}
            onApproveItem={socketState.approveQueueItem}
            onReorderItem={socketState.reorderQueueItem}
            onPlayNow={(itemId) => {
              handlePlayNextInQueue(itemId);
              setShowQueueModal(false);
            }}
          />

          <RoomSettingsModal
            open={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            roomName={effectiveRoomName}
            isPublic={effectiveIsPublic}
            quality={effectivePlayback.quality}
            graphicsQuality={graphicsQuality}
            syncEnabled={effectivePlayback.syncEnabled}
            voiceChatEnabled={fsRoom?.voiceChatEnabled ?? snapshot?.voiceChatEnabled ?? activeRoom.voiceChatEnabled}
            isHost={isHost}
            hostId={effectiveHostId}
            currentUid={user.uid}
            members={effectiveMembers}
            inVoice={voice.inVoice}
            micMuted={voice.micMuted}
            voiceError={voice.voiceError}
            peerVolumes={voice.peerVolumes}
            onChangeGraphicsQuality={handleChangeGraphicsQuality}
            onToggleVoice={voice.toggleVoice}
            onToggleMute={voice.toggleMute}
            onSetPeerVolume={voice.setPeerVolume}
            onSaveSettings={handleSaveRoomSettings}
            onTransferHost={handleTransferHost}
            onKickMember={handleKickMember}
            onCloseRoom={handleCloseRoom}
          />

          <TransferHostBeforeLeaveModal
            open={showLeaveHostModal}
            members={effectiveMembers}
            currentUid={user.uid}
            onClose={() => setShowLeaveHostModal(false)}
            onSelectNewHostAndLeave={handleTransferHostAndLeave}
            onCloseRoomForEveryone={handleCloseRoom}
          />
        </>
      )}

      {/* === Global Toast Notification === */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] max-w-sm w-[92vw] sm:w-auto px-4 py-2.5 rounded-2xl cinema-glass border border-white/15 shadow-2xl flex items-center gap-2.5 text-xs font-medium text-white"
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#E5C17B] shrink-0" />
            )}
            <span className="flex-1">{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss message"
              className="text-white/60 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
