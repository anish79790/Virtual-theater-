export type SeatTier = 'classic' | 'prime' | 'recliner';
export type VideoQuality = 'auto' | 'hd1080' | 'hd720' | 'large';
export type GraphicsQuality = 'low' | 'medium' | 'high';
export type CinemaFocusMode = 'normal' | 'focus' | 'chat';
export type HomeTab = 'home' | 'rooms' | 'activity' | 'profile';

export const ALLOWED_REACTIONS = ['❤️', '😂', '🔥', '😮', '👏', '🍿'] as const;
export type ReactionEmoji = (typeof ALLOWED_REACTIONS)[number];

export interface SeatDefinition {
  id: string;
  row: 'A' | 'B' | 'C';
  number: number;
  tier: SeatTier;
  label: string;
}

export const AUDITORIUM_SEATS: SeatDefinition[] = [
  // Row A: Classic Front
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `A${i + 1}`,
    row: 'A' as const,
    number: i + 1,
    tier: 'classic' as const,
    label: 'Classic'
  })),
  // Row B: Prime Center
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `B${i + 1}`,
    row: 'B' as const,
    number: i + 1,
    tier: 'prime' as const,
    label: 'Prime'
  })),
  // Row C: Royal Gold Recliners
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `C${i + 1}`,
    row: 'C' as const,
    number: i + 1,
    tier: 'recliner' as const,
    label: 'Gold Recliner'
  }))
];

export function getSeatTier(seatId: string): SeatTier {
  if (seatId.startsWith('C')) return 'recliner';
  if (seatId.startsWith('B')) return 'prime';
  return 'classic';
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  preferredSeat: string;
  email?: string;
  notificationsEnabled?: boolean;
  autoLandscape?: boolean;
}

export interface CinemaRoom {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  status: 'open' | 'closed';
  hostId: string;
  hostName: string;
  createdBy: string;
  currentVideoId: string;
  currentVideoTitle: string;
  videoQuality: VideoQuality;
  syncEnabled: boolean;
  voiceChatEnabled: boolean;
  memberUids: string[];
  isPlaying?: boolean;
  playbackPosition?: number;
  playbackUpdatedAt?: number;
  sourceMode?: WatchSourceMode;
  browserUrl?: string;
  browserQuery?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RecentRoom {
  roomId: string;
  code: string;
  name: string;
  isPublic: boolean;
  lastVideoId: string;
  lastVideoTitle: string;
  joinedAt?: unknown;
}

export interface LiveMember {
  uid: string;
  socketId: string;
  displayName: string;
  photoURL: string;
  seatId: string;
  seatTier: SeatTier;
  isOnline: boolean;
  inVoice: boolean;
  micMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
}

export type WatchSourceMode = 'youtube' | 'browser';

export interface PlaybackState {
  sourceMode?: WatchSourceMode;
  browserUrl?: string;
  browserQuery?: string;
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  position: number;
  updatedAt: number;
  playbackRate: number;
  quality: VideoQuality;
  syncEnabled: boolean;
}

export interface QueueItem {
  id: string;
  roomId: string;
  videoId: string;
  title: string;
  addedByUid: string;
  addedByName: string;
  order: number;
  status: 'pending' | 'approved' | 'played';
  isPublicRoom: boolean;
  createdAt?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: number;
}

export interface FloatingReaction {
  id: string;
  emoji: ReactionEmoji;
  senderUid: string;
  senderName: string;
  xPercent: number;
  createdAt: number;
}

export interface WatchParty {
  id: string;
  title: string;
  roomCode: string;
  hostId: string;
  hostName: string;
  videoId: string;
  videoTitle: string;
  scheduledFor: string;
  isPublic: boolean;
}

export interface OnlinePresenceUser {
  uid: string;
  displayName: string;
  photoURL: string;
  roomCode?: string;
  roomName?: string;
}

export interface RoomNotification {
  id: string;
  type: 'join' | 'leave' | 'host' | 'queue' | 'system' | 'error';
  message: string;
  timestamp: number;
}

export interface RoomSettingsPayload {
  name?: string;
  isPublic?: boolean;
  videoQuality?: VideoQuality;
  syncEnabled?: boolean;
  voiceChatEnabled?: boolean;
}

export interface LiveRoomSnapshot {
  roomCode: string;
  name: string;
  isPublic: boolean;
  status: 'open' | 'closed';
  hostId: string;
  hostName: string;
  voiceChatEnabled: boolean;
  playback: PlaybackState;
  members: LiveMember[];
  queue: QueueItem[];
  messages: ChatMessage[];
}
