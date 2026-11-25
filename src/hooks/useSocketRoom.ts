import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ChatMessage,
  CinemaRoom,
  FloatingReaction,
  LiveMember,
  LiveRoomSnapshot,
  OnlinePresenceUser,
  PlaybackState,
  QueueItem,
  ReactionEmoji,
  RoomNotification,
  RoomSettingsPayload,
  UserProfile,
  VideoQuality,
  WatchSourceMode
} from '../types/cinema';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseSocketRoomParams {
  user: UserProfile | null;
  activeRoom: CinemaRoom | null;
  onKicked?: () => void;
  onRoomClosed?: () => void;
}

export function useSocketRoom({ user, activeRoom, onKicked, onRoomClosed }: UseSocketRoomParams) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [roomSnapshot, setRoomSnapshot] = useState<LiveRoomSnapshot | null>(null);
  const [roomOnlineCounts, setRoomOnlineCounts] = useState<Record<string, number>>({});
  const [onlineUsers, setOnlineUsers] = useState<OnlinePresenceUser[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ uid: string; displayName: string }[]>([]);
  const [notifications, setNotifications] = useState<RoomNotification[]>([]);
  const [latestMessage, setLatestMessage] = useState<ChatMessage | null>(null);

  const activeRoomRef = useRef<CinemaRoom | null>(activeRoom);
  const userRef = useRef<UserProfile | null>(user);
  const onKickedRef = useRef(onKicked);
  const onRoomClosedRef = useRef(onRoomClosed);

  activeRoomRef.current = activeRoom;
  userRef.current = user;
  onKickedRef.current = onKicked;
  onRoomClosedRef.current = onRoomClosed;

  const pushNotification = useCallback((type: RoomNotification['type'], message: string) => {
    const entry: RoomNotification = {
      id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      message,
      timestamp: Date.now()
    };
    setNotifications((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  const joinRoomOnSocket = useCallback((socket: Socket, room: CinemaRoom, profile: UserProfile) => {
    socket.emit('room:join', {
      roomCode: room.code,
      roomName: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      hostName: room.hostName,
      videoId: room.currentVideoId,
      videoTitle: room.currentVideoTitle,
      videoQuality: room.videoQuality,
      syncEnabled: room.syncEnabled,
      voiceChatEnabled: room.voiceChatEnabled,
      isPlaying: room.isPlaying,
      playbackPosition: room.playbackPosition,
      playbackUpdatedAt: room.playbackUpdatedAt,
      sourceMode: room.sourceMode,
      browserUrl: room.browserUrl,
      browserQuery: room.browserQuery,
      user: {
        uid: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        preferredSeat: profile.preferredSeat
      }
    });
  }, []);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      if (userRef.current) {
        socket.emit('presence:identify', {
          uid: userRef.current.uid,
          displayName: userRef.current.displayName,
          photoURL: userRef.current.photoURL
        });
      }
      if (activeRoomRef.current && userRef.current) {
        joinRoomOnSocket(socket, activeRoomRef.current, userRef.current);
      }
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socket.on('presence:update', (payload: { roomCounts: Record<string, number>; onlineUsers: OnlinePresenceUser[] }) => {
      setRoomOnlineCounts(payload.roomCounts || {});
      setOnlineUsers(payload.onlineUsers || []);
    });

    socket.on('room:state', (snapshot: LiveRoomSnapshot) => {
      setRoomSnapshot(snapshot);
      if (snapshot.messages.length > 0) {
        setLatestMessage(snapshot.messages[snapshot.messages.length - 1]);
      }
    });

    socket.on('playback:sync', (playback: PlaybackState) => {
      setRoomSnapshot((prev) => (prev ? { ...prev, playback } : prev));
    });

    socket.on('members:updated', (payload: { members: LiveMember[] }) => {
      setRoomSnapshot((prev) => (prev ? { ...prev, members: payload.members } : prev));
    });

    socket.on('member:joined', (payload: { member: LiveMember; members: LiveMember[] }) => {
      setRoomSnapshot((prev) => (prev ? { ...prev, members: payload.members } : prev));
      pushNotification('join', `${payload.member.displayName} took seat ${payload.member.seatId}`);
    });

    socket.on('member:left', (payload: { uid: string; displayName: string; members: LiveMember[] }) => {
      setRoomSnapshot((prev) => (prev ? { ...prev, members: payload.members } : prev));
      pushNotification('leave', `${payload.displayName} left the cinema`);
    });

    socket.on('chat:message', (message: ChatMessage) => {
      setRoomSnapshot((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return { ...prev, messages: [...prev.messages, message].slice(-100) };
      });
      setLatestMessage(message);
    });

    socket.on('chat:typing', (payload: { uid: string; displayName: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        const filtered = prev.filter((u) => u.uid !== payload.uid);
        return payload.isTyping ? [...filtered, { uid: payload.uid, displayName: payload.displayName }] : filtered;
      });
    });

    socket.on('reaction:received', (reaction: FloatingReaction) => {
      setFloatingReactions((prev) => [...prev.slice(-18), reaction]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 3200);
    });

    socket.on('queue:updated', (payload: { queue: QueueItem[] }) => {
      setRoomSnapshot((prev) => (prev ? { ...prev, queue: payload.queue } : prev));
    });

    socket.on('room:hostChanged', (payload: { hostId: string; hostName: string }) => {
      setRoomSnapshot((prev) => (prev ? { ...prev, hostId: payload.hostId, hostName: payload.hostName } : prev));
      pushNotification('host', `${payload.hostName} is now the cinema host`);
    });

    socket.on('room:kicked', () => {
      setRoomSnapshot(null);
      pushNotification('error', 'You were removed from the room by the host.');
      onKickedRef.current?.();
    });

    socket.on('room:closed', () => {
      setRoomSnapshot(null);
      pushNotification('system', 'The host closed this cinema hall.');
      onRoomClosedRef.current?.();
    });

    socket.on('room:error', (payload: { message?: string }) => {
      if (payload?.message) {
        pushNotification('error', payload.message);
      }
    });

    // Fetch initial presence snapshot via REST immediately
    fetch('/api/presence')
      .then((r) => r.json())
      .then((data: { roomCounts?: Record<string, number>; onlineUsers?: OnlinePresenceUser[] }) => {
        if (data.roomCounts) setRoomOnlineCounts(data.roomCounts);
        if (data.onlineUsers) setOnlineUsers(data.onlineUsers);
      })
      .catch(() => {});

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [joinRoomOnSocket, pushNotification]);

  // Identify user when auth completes
  useEffect(() => {
    const socket = socketRef.current;
    if (socket && socket.connected && user) {
      socket.emit('presence:identify', {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL
      });
    }
  }, [user]);

  // Join/leave socket room when activeRoom changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (activeRoom && user) {
      if (socket.connected) {
        joinRoomOnSocket(socket, activeRoom, user);
      }
    } else {
      socket.emit('room:leave');
      setRoomSnapshot(null);
      setLatestMessage(null);
      setTypingUsers([]);
    }
  }, [activeRoom?.code, user?.uid, joinRoomOnSocket]);

  // Emitters
  const selectSeat = useCallback((seatId: string) => {
    socketRef.current?.emit('seat:select', { seatId });
  }, []);

  const emitPlaybackControl = useCallback(
    (payload: {
      action:
        | 'play'
        | 'pause'
        | 'seek'
        | 'videoChange'
        | 'qualityChange'
        | 'syncToggle'
        | 'sourceChange'
        | 'browserNavigate';
      position?: number;
      videoId?: string;
      videoTitle?: string;
      quality?: VideoQuality;
      syncEnabled?: boolean;
      sourceMode?: WatchSourceMode;
      browserUrl?: string;
      browserQuery?: string;
    }) => {
      socketRef.current?.emit('playback:control', payload);
    },
    []
  );

  const requestPlaybackSync = useCallback(() => {
    socketRef.current?.emit('playback:requestSync');
  }, []);

  const sendChatMessage = useCallback((text: string, id?: string) => {
    socketRef.current?.emit('chat:send', { id, text });
  }, []);

  const emitTyping = useCallback((isTyping: boolean) => {
    socketRef.current?.emit('chat:typing', { isTyping });
  }, []);

  const sendReaction = useCallback((emoji: ReactionEmoji) => {
    socketRef.current?.emit('reaction:send', { emoji });
  }, []);

  const addQueueItem = useCallback((item: { id: string; videoId: string; title: string }) => {
    socketRef.current?.emit('queue:add', item);
  }, []);

  const removeQueueItem = useCallback((itemId: string) => {
    socketRef.current?.emit('queue:remove', { itemId });
  }, []);

  const approveQueueItem = useCallback((itemId: string) => {
    socketRef.current?.emit('queue:approve', { itemId });
  }, []);

  const reorderQueueItem = useCallback((itemId: string, direction: 'up' | 'down') => {
    socketRef.current?.emit('queue:reorder', { itemId, direction });
  }, []);

  const playNextInQueue = useCallback((itemId?: string) => {
    socketRef.current?.emit('queue:playNext', { itemId });
  }, []);

  const emitSettingsUpdate = useCallback((payload: RoomSettingsPayload) => {
    socketRef.current?.emit('room:settingsUpdate', payload);
  }, []);

  const emitTransferHost = useCallback((targetUid: string) => {
    socketRef.current?.emit('room:transferHost', { targetUid });
  }, []);

  const emitKickMember = useCallback((targetUid: string) => {
    socketRef.current?.emit('room:kickMember', { targetUid });
  }, []);

  const emitCloseRoom = useCallback(() => {
    socketRef.current?.emit('room:close');
  }, []);

  const leaveSocketRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    setRoomSnapshot(null);
  }, []);

  return {
    socketRef,
    connectionStatus,
    roomSnapshot,
    roomOnlineCounts,
    onlineUsers,
    floatingReactions,
    typingUsers,
    notifications,
    latestMessage,
    clearLatestMessage: () => setLatestMessage(null),
    pushNotification,
    selectSeat,
    emitPlaybackControl,
    requestPlaybackSync,
    sendChatMessage,
    emitTyping,
    sendReaction,
    addQueueItem,
    removeQueueItem,
    approveQueueItem,
    reorderQueueItem,
    playNextInQueue,
    emitSettingsUpdate,
    emitTransferHost,
    emitKickMember,
    emitCloseRoom,
    leaveSocketRoom
  };
}
