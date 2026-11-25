import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import type {
  ChatMessage,
  LiveMember,
  LiveRoomSnapshot,
  OnlinePresenceUser,
  PlaybackState,
  QueueItem,
  ReactionEmoji,
  RoomSettingsPayload,
  SeatTier,
  VideoQuality,
  WatchSourceMode
} from './src/types/cinema.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_ROOM_CODE = /^[A-Z0-9]{6}$/;
const VALID_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const VALID_SEAT_ID = /^[A-C][1-8]$/;
const VALID_REACTIONS = new Set<string>(['❤️', '😂', '🔥', '😮', '👏', '🍿']);
const ALL_SEAT_IDS = [
  'B4', 'B5', 'B3', 'B6', 'B2', 'B7', 'B1', 'B8',
  'C4', 'C5', 'C3', 'C6', 'C2', 'C7', 'C1', 'C8',
  'A4', 'A5', 'A3', 'A6', 'A2', 'A7', 'A1', 'A8'
];

interface ServerRoomState {
  roomCode: string;
  name: string;
  isPublic: boolean;
  status: 'open' | 'closed';
  hostId: string;
  hostName: string;
  voiceChatEnabled: boolean;
  playback: PlaybackState;
  members: Map<string, LiveMember>; // keyed by uid
  queue: QueueItem[];
  messages: ChatMessage[];
}

const rooms = new Map<string, ServerRoomState>();
const globalPresence = new Map<string, OnlinePresenceUser & { socketIds: Set<string> }>();

function getSeatTierServer(seatId: string): SeatTier {
  if (seatId.startsWith('C')) return 'recliner';
  if (seatId.startsWith('B')) return 'prime';
  return 'classic';
}

function computeLivePosition(playback: PlaybackState): number {
  if (!playback.isPlaying) return playback.position;
  const elapsedSec = Math.max(0, (Date.now() - playback.updatedAt) / 1000);
  return playback.position + elapsedSec * playback.playbackRate;
}

function pickAvailableSeat(room: ServerRoomState, preferredSeat?: string, ignoreUid?: string): string {
  const taken = new Set<string>();
  for (const m of room.members.values()) {
    if (m.uid !== ignoreUid && m.seatId) {
      taken.add(m.seatId);
    }
  }
  if (preferredSeat && VALID_SEAT_ID.test(preferredSeat) && !taken.has(preferredSeat)) {
    return preferredSeat;
  }
  for (const seat of ALL_SEAT_IDS) {
    if (!taken.has(seat)) return seat;
  }
  return 'B3';
}

function serializeRoom(room: ServerRoomState): LiveRoomSnapshot {
  return {
    roomCode: room.roomCode,
    name: room.name,
    isPublic: room.isPublic,
    status: room.status,
    hostId: room.hostId,
    hostName: room.hostName,
    voiceChatEnabled: room.voiceChatEnabled,
    playback: {
      ...room.playback,
      position: computeLivePosition(room.playback),
      updatedAt: Date.now()
    },
    members: Array.from(room.members.values()),
    queue: [...room.queue].sort((a, b) => a.order - b.order),
    messages: room.messages.slice(-80)
  };
}

function getPresenceSummary() {
  const roomCounts: Record<string, number> = {};
  for (const [code, r] of rooms.entries()) {
    if (r.status === 'open' && r.members.size > 0) {
      roomCounts[code] = r.members.size;
    }
  }
  const onlineUsers: OnlinePresenceUser[] = [];
  for (const u of globalPresence.values()) {
    onlineUsers.push({
      uid: u.uid,
      displayName: u.displayName,
      photoURL: u.photoURL,
      roomCode: u.roomCode,
      roomName: u.roomName
    });
  }
  return { roomCounts, onlineUsers };
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: false
    },
    pingInterval: 15000,
    pingTimeout: 25000
  });

  app.use(express.json({ limit: '64kb' }));

  // === REST API Routes ===
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size, onlineUsers: globalPresence.size });
  });

  app.get('/api/presence', (_req, res) => {
    res.json(getPresenceSummary());
  });

  // Safe YouTube oEmbed metadata lookup (strictly validates 11-char videoId; fixed YouTube host prevents SSRF)
  app.get('/api/youtube/oembed', async (req, res) => {
    const rawId = typeof req.query.videoId === 'string' ? req.query.videoId.trim() : '';
    if (!VALID_VIDEO_ID.test(rawId)) {
      res.status(400).json({ error: 'Invalid YouTube video ID.' });
      return;
    }

    const fallback = {
      videoId: rawId,
      title: `YouTube Video (${rawId})`,
      author: 'YouTube',
      thumbnailUrl: `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`
    };

    try {
      const targetUrl = new URL('https://www.youtube.com/oembed');
      targetUrl.searchParams.set('url', `https://www.youtube.com/watch?v=${rawId}`);
      targetUrl.searchParams.set('format', 'json');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const response = await fetch(targetUrl.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        res.json({ ...fallback, embeddableWarning: response.status === 401 || response.status === 403 });
        return;
      }

      const data = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      res.json({
        videoId: rawId,
        title: sanitizeString(data.title, 140) || fallback.title,
        author: sanitizeString(data.author_name, 80) || 'YouTube',
        thumbnailUrl: `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`
      });
    } catch {
      res.json(fallback);
    }
  });

  // Safe Cinema Browser Search API (fixed allowlisted Wikipedia & DuckDuckGo endpoints — zero SSRF)
  app.get('/api/browser/search', async (req, res) => {
    const queryText = sanitizeString(req.query.q, 160);
    if (!queryText) {
      res.json({ query: '', results: [] });
      return;
    }

    const results: { title: string; url: string; snippet: string; source: string }[] = [];

    try {
      const ddgUrl = new URL('https://api.duckduckgo.com/');
      ddgUrl.searchParams.set('q', queryText);
      ddgUrl.searchParams.set('format', 'json');
      ddgUrl.searchParams.set('no_html', '1');
      ddgUrl.searchParams.set('skip_disambig', '1');

      const wikiUrl = new URL('https://en.wikipedia.org/w/api.php');
      wikiUrl.searchParams.set('action', 'opensearch');
      wikiUrl.searchParams.set('search', queryText);
      wikiUrl.searchParams.set('limit', '6');
      wikiUrl.searchParams.set('namespace', '0');
      wikiUrl.searchParams.set('format', 'json');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const [ddgRes, wikiRes] = await Promise.allSettled([
        fetch(ddgUrl.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } }),
        fetch(wikiUrl.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } })
      ]);
      clearTimeout(timeout);

      if (ddgRes.status === 'fulfilled' && ddgRes.value.ok) {
        const ddgData = (await ddgRes.value.json()) as {
          Heading?: string;
          AbstractText?: string;
          AbstractURL?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        };
        if (ddgData.AbstractText && ddgData.AbstractURL) {
          results.push({
            title: sanitizeString(ddgData.Heading || queryText, 120),
            url: ddgData.AbstractURL,
            snippet: sanitizeString(ddgData.AbstractText, 220),
            source: 'Web Instant'
          });
        }
        if (Array.isArray(ddgData.RelatedTopics)) {
          for (const topic of ddgData.RelatedTopics.slice(0, 5)) {
            if (topic.FirstURL && topic.Text) {
              results.push({
                title: sanitizeString(topic.Text.split(' - ')[0], 110),
                url: topic.FirstURL,
                snippet: sanitizeString(topic.Text, 200),
                source: 'DuckDuckGo'
              });
            }
          }
        }
      }

      if (wikiRes.status === 'fulfilled' && wikiRes.value.ok) {
        const wikiData = (await wikiRes.value.json()) as [string, string[], string[], string[]];
        const titles = Array.isArray(wikiData[1]) ? wikiData[1] : [];
        const descs = Array.isArray(wikiData[2]) ? wikiData[2] : [];
        const links = Array.isArray(wikiData[3]) ? wikiData[3] : [];
        for (let i = 0; i < titles.length; i++) {
          if (links[i] && !results.some((r) => r.url === links[i])) {
            results.push({
              title: sanitizeString(titles[i], 110),
              url: links[i],
              snippet: sanitizeString(descs[i] || `Wikipedia article about ${titles[i]}`, 200),
              source: 'Wikipedia'
            });
          }
        }
      }
    } catch {
      // Return whatever results were gathered
    }

    res.json({ query: queryText, results: results.slice(0, 10) });
  });

  // === Socket.IO Real-Time Cinema & WebRTC Signaling ===
  io.on('connection', (socket) => {
    let currentUid = '';
    let currentRoomCode = '';

    const broadcastPresence = () => {
      io.emit('presence:update', getPresenceSummary());
    };

    socket.on('presence:identify', (payload: { uid?: string; displayName?: string; photoURL?: string }) => {
      const uid = sanitizeString(payload?.uid, 128);
      if (!uid) return;
      currentUid = uid;
      const existing = globalPresence.get(uid);
      if (existing) {
        existing.displayName = sanitizeString(payload.displayName, 60) || existing.displayName;
        existing.photoURL = sanitizeString(payload.photoURL, 500);
        existing.socketIds.add(socket.id);
      } else {
        globalPresence.set(uid, {
          uid,
          displayName: sanitizeString(payload.displayName, 60) || 'Guest',
          photoURL: sanitizeString(payload.photoURL, 500),
          socketIds: new Set([socket.id])
        });
      }
      broadcastPresence();
    });

    socket.on(
      'room:join',
      (payload: {
        roomCode: string;
        roomName: string;
        isPublic: boolean;
        hostId: string;
        hostName: string;
        videoId: string;
        videoTitle: string;
        videoQuality?: VideoQuality;
        syncEnabled?: boolean;
        voiceChatEnabled?: boolean;
        isPlaying?: boolean;
        playbackPosition?: number;
        playbackUpdatedAt?: number;
        sourceMode?: WatchSourceMode;
        browserUrl?: string;
        browserQuery?: string;
        initialQueue?: QueueItem[];
        initialMessages?: ChatMessage[];
        user: { uid: string; displayName: string; photoURL: string; preferredSeat?: string };
      }) => {
        const roomCode = sanitizeString(payload?.roomCode, 6).toUpperCase();
        const uid = sanitizeString(payload?.user?.uid, 128);
        if (!VALID_ROOM_CODE.test(roomCode) || !uid) {
          socket.emit('room:error', { message: 'Invalid room code or user identity.' });
          return;
        }

        // Leave previous room if any
        if (currentRoomCode && currentRoomCode !== roomCode) {
          leaveCurrentRoom();
        }

        currentUid = uid;
        currentRoomCode = roomCode;
        socket.join(roomCode);

        let room = rooms.get(roomCode);
        if (!room) {
          const initVideoId = VALID_VIDEO_ID.test(payload.videoId) ? payload.videoId : 'eRsGyueVLvQ';
          const initPos =
            typeof payload.playbackPosition === 'number' && Number.isFinite(payload.playbackPosition) && payload.playbackPosition >= 0
              ? payload.playbackPosition
              : 0;
          const initUpdatedAt =
            typeof payload.playbackUpdatedAt === 'number' && Number.isFinite(payload.playbackUpdatedAt) && payload.playbackUpdatedAt > 0
              ? payload.playbackUpdatedAt
              : Date.now();
          room = {
            roomCode,
            name: sanitizeString(payload.roomName, 60) || 'Cinema Room',
            isPublic: Boolean(payload.isPublic),
            status: 'open',
            hostId: sanitizeString(payload.hostId, 128) || uid,
            hostName: sanitizeString(payload.hostName, 60) || sanitizeString(payload.user.displayName, 60) || 'Host',
            voiceChatEnabled: Boolean(payload.voiceChatEnabled),
            playback: {
              sourceMode: payload.sourceMode === 'browser' ? 'browser' : 'youtube',
              browserUrl: sanitizeString(payload.browserUrl, 600),
              browserQuery: sanitizeString(payload.browserQuery, 160),
              videoId: initVideoId,
              videoTitle: sanitizeString(payload.videoTitle, 140) || 'Cinema Feature',
              isPlaying: Boolean(payload.isPlaying),
              position: initPos,
              updatedAt: initUpdatedAt,
              playbackRate: 1,
              quality: payload.videoQuality || 'auto',
              syncEnabled: payload.syncEnabled !== false
            },
            members: new Map(),
            queue: Array.isArray(payload.initialQueue) ? payload.initialQueue.slice(0, 50) : [],
            messages: Array.isArray(payload.initialMessages) ? payload.initialMessages.slice(-80) : []
          };
          rooms.set(roomCode, room);
        } else if (room.status === 'closed') {
          socket.emit('room:closed', { roomCode });
          return;
        } else {
          // If Firestore already transferred host while old host was disconnected, honor authoritative hostId
          const incomingHostId = sanitizeString(payload.hostId, 128);
          if (incomingHostId && incomingHostId !== room.hostId && !room.members.has(room.hostId)) {
            room.hostId = incomingHostId;
            room.hostName = sanitizeString(payload.hostName, 60) || room.hostName;
          }
        }

        const existingMember = room.members.get(uid);
        const seatId = pickAvailableSeat(room, existingMember?.seatId || payload.user.preferredSeat, uid);
        const member: LiveMember = {
          uid,
          socketId: socket.id,
          displayName: sanitizeString(payload.user.displayName, 60) || 'Viewer',
          photoURL: sanitizeString(payload.user.photoURL, 500),
          seatId,
          seatTier: getSeatTierServer(seatId),
          isOnline: true,
          inVoice: existingMember?.inVoice || false,
          micMuted: existingMember ? existingMember.micMuted : true,
          isSpeaking: false,
          joinedAt: existingMember?.joinedAt || Date.now()
        };
        room.members.set(uid, member);

        // Update global presence
        const presenceEntry = globalPresence.get(uid);
        if (presenceEntry) {
          presenceEntry.roomCode = room.isPublic ? room.roomCode : undefined;
          presenceEntry.roomName = room.isPublic ? room.name : 'Private Hall';
          presenceEntry.socketIds.add(socket.id);
        } else {
          globalPresence.set(uid, {
            uid,
            displayName: member.displayName,
            photoURL: member.photoURL,
            roomCode: room.isPublic ? room.roomCode : undefined,
            roomName: room.isPublic ? room.name : 'Private Hall',
            socketIds: new Set([socket.id])
          });
        }

        socket.emit('room:state', serializeRoom(room));
        socket.to(roomCode).emit('member:joined', {
          member,
          members: Array.from(room.members.values())
        });
        broadcastPresence();
      }
    );

    socket.on('seat:select', (payload: { seatId?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.status === 'closed') return;

      const requestedSeat = sanitizeString(payload?.seatId, 4).toUpperCase();
      if (!VALID_SEAT_ID.test(requestedSeat)) return;

      // Check seat availability
      for (const m of room.members.values()) {
        if (m.uid !== currentUid && m.seatId === requestedSeat) {
          socket.emit('room:error', { message: `Seat ${requestedSeat} is already taken by ${m.displayName}.` });
          return;
        }
      }

      const member = room.members.get(currentUid);
      if (!member) return;
      member.seatId = requestedSeat;
      member.seatTier = getSeatTierServer(requestedSeat);

      io.to(currentRoomCode).emit('members:updated', {
        members: Array.from(room.members.values())
      });
    });

    socket.on(
      'playback:control',
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
        if (!currentRoomCode || !currentUid) return;
        const room = rooms.get(currentRoomCode);
        if (!room || room.status === 'closed') return;

        // Enforce host-only playback control on server
        if (room.hostId !== currentUid) {
          socket.emit('room:error', { message: 'Only the host can control cinema playback.' });
          return;
        }

        const now = Date.now();
        const safePos =
          typeof payload.position === 'number' && Number.isFinite(payload.position) && payload.position >= 0
            ? payload.position
            : computeLivePosition(room.playback);

        switch (payload.action) {
          case 'play':
            room.playback.isPlaying = true;
            room.playback.position = safePos;
            room.playback.updatedAt = now;
            break;
          case 'pause':
            room.playback.isPlaying = false;
            room.playback.position = safePos;
            room.playback.updatedAt = now;
            break;
          case 'seek':
            room.playback.position = safePos;
            room.playback.updatedAt = now;
            break;
          case 'videoChange': {
            const vid = sanitizeString(payload.videoId, 11);
            if (!VALID_VIDEO_ID.test(vid)) return;
            room.playback.sourceMode = 'youtube';
            room.playback.videoId = vid;
            room.playback.videoTitle = sanitizeString(payload.videoTitle, 140) || `YouTube Video (${vid})`;
            room.playback.position = 0;
            room.playback.isPlaying = true;
            room.playback.updatedAt = now;
            break;
          }
          case 'qualityChange': {
            const q = payload.quality;
            if (q === 'auto' || q === 'hd1080' || q === 'hd720' || q === 'large') {
              room.playback.quality = q;
            }
            break;
          }
          case 'syncToggle':
            room.playback.syncEnabled = Boolean(payload.syncEnabled);
            break;
          case 'sourceChange': {
            if (payload.sourceMode === 'youtube' || payload.sourceMode === 'browser') {
              room.playback.sourceMode = payload.sourceMode;
              if (payload.sourceMode === 'browser') {
                room.playback.isPlaying = false;
              }
              room.playback.updatedAt = now;
            }
            break;
          }
          case 'browserNavigate': {
            const rawUrl = sanitizeString(payload.browserUrl, 600);
            const safeQuery = sanitizeString(payload.browserQuery, 160);
            let safeUrl = '';
            if (rawUrl) {
              try {
                const parsed = new URL(rawUrl);
                if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                  safeUrl = parsed.toString();
                }
              } catch {
                safeUrl = '';
              }
            }
            room.playback.sourceMode = 'browser';
            room.playback.browserUrl = safeUrl;
            room.playback.browserQuery = safeQuery;
            room.playback.updatedAt = now;
            break;
          }
        }

        io.to(currentRoomCode).emit('playback:sync', {
          ...room.playback,
          position: computeLivePosition(room.playback),
          updatedAt: Date.now()
        });
      }
    );

    socket.on('playback:requestSync', () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      socket.emit('playback:sync', {
        ...room.playback,
        position: computeLivePosition(room.playback),
        updatedAt: Date.now()
      });
    });

    socket.on('chat:send', (payload: { id?: string; text?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.status === 'closed') return;
      const member = room.members.get(currentUid);
      if (!member) return;

      const text = sanitizeString(payload?.text, 400);
      if (!text) return;

      const msgId = sanitizeString(payload?.id, 64) || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (room.messages.some((m) => m.id === msgId)) return;

      const message: ChatMessage = {
        id: msgId,
        roomId: currentRoomCode,
        senderUid: member.uid,
        senderName: member.displayName,
        senderAvatar: member.photoURL,
        text,
        timestamp: Date.now()
      };
      room.messages.push(message);
      if (room.messages.length > 120) {
        room.messages = room.messages.slice(-100);
      }

      io.to(currentRoomCode).emit('chat:message', message);
    });

    socket.on('chat:typing', (payload: { isTyping?: boolean }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const member = room.members.get(currentUid);
      if (!member) return;
      socket.to(currentRoomCode).emit('chat:typing', {
        uid: member.uid,
        displayName: member.displayName,
        isTyping: Boolean(payload?.isTyping)
      });
    });

    socket.on('reaction:send', (payload: { emoji?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.status === 'closed') return;
      const member = room.members.get(currentUid);
      if (!member) return;

      const emoji = payload?.emoji;
      if (!emoji || !VALID_REACTIONS.has(emoji)) return;

      io.to(currentRoomCode).emit('reaction:received', {
        id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        emoji: emoji as ReactionEmoji,
        senderUid: member.uid,
        senderName: member.displayName,
        xPercent: 55 + Math.random() * 36,
        createdAt: Date.now()
      });
    });

    // === Watch Queue Real-Time Handlers ===
    socket.on('queue:add', (payload: { id?: string; videoId?: string; title?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.status === 'closed') return;
      const member = room.members.get(currentUid);
      if (!member) return;

      const videoId = sanitizeString(payload?.videoId, 11);
      if (!VALID_VIDEO_ID.test(videoId)) return;

      const itemId = sanitizeString(payload?.id, 64) || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      if (room.queue.some((q) => q.id === itemId)) return;

      const nextOrder = room.queue.length > 0 ? Math.max(...room.queue.map((q) => q.order)) + 1 : 1;
      const item: QueueItem = {
        id: itemId,
        roomId: currentRoomCode,
        videoId,
        title: sanitizeString(payload?.title, 140) || `YouTube Video (${videoId})`,
        addedByUid: member.uid,
        addedByName: member.displayName,
        order: nextOrder,
        status: room.hostId === currentUid ? 'approved' : 'pending',
        isPublicRoom: room.isPublic,
        createdAt: Date.now()
      };
      room.queue.push(item);
      io.to(currentRoomCode).emit('queue:updated', { queue: [...room.queue].sort((a, b) => a.order - b.order) });
    });

    socket.on('queue:remove', (payload: { itemId?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const item = room.queue.find((q) => q.id === payload?.itemId);
      if (!item) return;
      if (item.addedByUid !== currentUid && room.hostId !== currentUid) return;

      room.queue = room.queue.filter((q) => q.id !== item.id);
      io.to(currentRoomCode).emit('queue:updated', { queue: [...room.queue].sort((a, b) => a.order - b.order) });
    });

    socket.on('queue:approve', (payload: { itemId?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;
      const item = room.queue.find((q) => q.id === payload?.itemId);
      if (!item) return;
      item.status = 'approved';
      io.to(currentRoomCode).emit('queue:updated', { queue: [...room.queue].sort((a, b) => a.order - b.order) });
    });

    socket.on('queue:reorder', (payload: { itemId?: string; direction?: 'up' | 'down' }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;

      const sorted = [...room.queue].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((q) => q.id === payload?.itemId);
      if (idx === -1) return;
      const swapIdx = payload.direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;

      const tempOrder = sorted[idx].order;
      sorted[idx].order = sorted[swapIdx].order;
      sorted[swapIdx].order = tempOrder;
      room.queue = sorted;
      io.to(currentRoomCode).emit('queue:updated', { queue: [...room.queue].sort((a, b) => a.order - b.order) });
    });

    socket.on('queue:playNext', (payload?: { itemId?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;

      const sorted = [...room.queue].sort((a, b) => a.order - b.order);
      const nextItem = payload?.itemId
        ? sorted.find((q) => q.id === payload.itemId)
        : sorted.find((q) => q.status === 'approved') || sorted[0];

      if (!nextItem) return;

      room.queue = room.queue.filter((q) => q.id !== nextItem.id);
      room.playback.videoId = nextItem.videoId;
      room.playback.videoTitle = nextItem.title;
      room.playback.position = 0;
      room.playback.isPlaying = true;
      room.playback.updatedAt = Date.now();

      io.to(currentRoomCode).emit('queue:updated', { queue: [...room.queue].sort((a, b) => a.order - b.order) });
      io.to(currentRoomCode).emit('playback:sync', { ...room.playback });
    });

    // === Room Management (Host Only) ===
    socket.on('room:settingsUpdate', (payload: RoomSettingsPayload) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;

      if (typeof payload.name === 'string' && payload.name.trim()) {
        room.name = sanitizeString(payload.name, 60);
      }
      if (typeof payload.isPublic === 'boolean') {
        room.isPublic = payload.isPublic;
      }
      if (typeof payload.syncEnabled === 'boolean') {
        room.playback.syncEnabled = payload.syncEnabled;
      }
      if (typeof payload.voiceChatEnabled === 'boolean') {
        room.voiceChatEnabled = payload.voiceChatEnabled;
      }
      if (payload.videoQuality && ['auto', 'hd1080', 'hd720', 'large'].includes(payload.videoQuality)) {
        room.playback.quality = payload.videoQuality;
      }

      io.to(currentRoomCode).emit('room:state', serializeRoom(room));
    });

    socket.on('room:transferHost', (payload: { targetUid?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;
      const target = room.members.get(sanitizeString(payload?.targetUid, 128));
      if (!target) return;

      room.hostId = target.uid;
      room.hostName = target.displayName;
      io.to(currentRoomCode).emit('room:hostChanged', {
        hostId: room.hostId,
        hostName: room.hostName
      });
    });

    socket.on('room:kickMember', (payload: { targetUid?: string }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;
      const targetUid = sanitizeString(payload?.targetUid, 128);
      if (!targetUid || targetUid === currentUid) return;

      const target = room.members.get(targetUid);
      if (!target) return;
      room.members.delete(targetUid);
      io.to(target.socketId).emit('room:kicked', { roomCode: currentRoomCode });
      io.to(currentRoomCode).emit('member:left', {
        uid: targetUid,
        displayName: target.displayName,
        members: Array.from(room.members.values())
      });
      broadcastPresence();
    });

    socket.on('room:close', () => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room || room.hostId !== currentUid) return;
      room.status = 'closed';
      io.to(currentRoomCode).emit('room:closed', { roomCode: currentRoomCode });
      rooms.delete(currentRoomCode);
      broadcastPresence();
    });

    // === WebRTC Voice Chat Signaling ===
    socket.on('voice:state', (payload: { inVoice?: boolean; micMuted?: boolean; isSpeaking?: boolean }) => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;
      const member = room.members.get(currentUid);
      if (!member) return;

      const wasInVoice = member.inVoice;
      if (typeof payload.inVoice === 'boolean') member.inVoice = payload.inVoice;
      if (typeof payload.micMuted === 'boolean') member.micMuted = payload.micMuted;
      if (typeof payload.isSpeaking === 'boolean') member.isSpeaking = payload.isSpeaking;

      io.to(currentRoomCode).emit('members:updated', {
        members: Array.from(room.members.values())
      });

      if (!wasInVoice && member.inVoice) {
        // Notify existing voice peers to connect
        const voicePeers = Array.from(room.members.values()).filter((m) => m.inVoice && m.uid !== currentUid);
        socket.emit('voice:peers', { peers: voicePeers.map((p) => ({ uid: p.uid, socketId: p.socketId })) });
        socket.to(currentRoomCode).emit('voice:peerJoined', { uid: member.uid, socketId: socket.id });
      } else if (wasInVoice && !member.inVoice) {
        socket.to(currentRoomCode).emit('voice:peerLeft', { uid: member.uid, socketId: socket.id });
      }
    });

    socket.on('webrtc:offer', (payload: { targetSocketId: string; sdp: unknown }) => {
      if (!currentRoomCode || !currentUid || !payload?.targetSocketId) return;
      io.to(payload.targetSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        fromUid: currentUid,
        sdp: payload.sdp
      });
    });

    socket.on('webrtc:answer', (payload: { targetSocketId: string; sdp: unknown }) => {
      if (!currentRoomCode || !currentUid || !payload?.targetSocketId) return;
      io.to(payload.targetSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        fromUid: currentUid,
        sdp: payload.sdp
      });
    });

    socket.on('webrtc:ice-candidate', (payload: { targetSocketId: string; candidate: unknown }) => {
      if (!currentRoomCode || !currentUid || !payload?.targetSocketId) return;
      io.to(payload.targetSocketId).emit('webrtc:ice-candidate', {
        fromSocketId: socket.id,
        fromUid: currentUid,
        candidate: payload.candidate
      });
    });

    const leaveCurrentRoom = () => {
      if (!currentRoomCode || !currentUid) return;
      const room = rooms.get(currentRoomCode);
      const code = currentRoomCode;
      socket.leave(code);
      currentRoomCode = '';

      if (room) {
        const leaving = room.members.get(currentUid);
        if (leaving && leaving.socketId === socket.id) {
          room.members.delete(currentUid);
          if (leaving.inVoice) {
            socket.to(code).emit('voice:peerLeft', { uid: leaving.uid, socketId: socket.id });
          }
          socket.to(code).emit('member:left', {
            uid: leaving.uid,
            displayName: leaving.displayName,
            members: Array.from(room.members.values())
          });
          // Safety net: if the host disconnected abruptly while others remain, auto-promote earliest remaining member
          if (room.hostId === leaving.uid && room.members.size > 0) {
            const nextHost = Array.from(room.members.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
            if (nextHost) {
              room.hostId = nextHost.uid;
              room.hostName = nextHost.displayName;
              io.to(code).emit('room:hostChanged', {
                hostId: room.hostId,
                hostName: room.hostName
              });
            }
          }
          if (room.members.size === 0) {
            // Keep room state briefly for reconnects, prune after 10 min if still empty
            setTimeout(() => {
              const r = rooms.get(code);
              if (r && r.members.size === 0) {
                rooms.delete(code);
              }
            }, 10 * 60 * 1000);
          }
        }
      }

      const presenceEntry = globalPresence.get(currentUid);
      if (presenceEntry) {
        presenceEntry.roomCode = undefined;
        presenceEntry.roomName = undefined;
      }
      broadcastPresence();
    };

    socket.on('room:leave', () => {
      leaveCurrentRoom();
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom();
      if (currentUid) {
        const entry = globalPresence.get(currentUid);
        if (entry) {
          entry.socketIds.delete(socket.id);
          if (entry.socketIds.size === 0) {
            globalPresence.delete(currentUid);
          }
        }
        broadcastPresence();
      }
    });
  });

  // === Vite Middleware (Dev) or Static Assets (Prod) ===
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CineHall server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CineHall server:', err);
  process.exit(1);
});
