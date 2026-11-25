import { useState } from 'react';
import {
  Armchair,
  ArrowLeft,
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  Globe,
  Link2,
  ListVideo,
  LogOut,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Settings,
  Share2,
  Wifi,
  WifiOff
} from 'lucide-react';
import { extractYouTubeVideoId, fetchYouTubeMetadata, getYouTubeThumbnail } from '../lib/youtube';
import type { ConnectionStatus } from '../hooks/useSocketRoom';
import type {
  CinemaRoom,
  LiveMember,
  QueueItem,
  UserProfile,
  VideoQuality,
  WatchSourceMode
} from '../types/cinema';
import { Avatar } from './Avatar';

interface RoomLobbyViewProps {
  room: CinemaRoom;
  user: UserProfile;
  members: LiveMember[];
  queue: QueueItem[];
  hostId: string;
  sourceMode: WatchSourceMode;
  videoId: string;
  videoTitle: string;
  videoQuality: VideoQuality;
  syncEnabled: boolean;
  inVoice: boolean;
  micMuted: boolean;
  connectionStatus: ConnectionStatus;
  onBack: () => void;
  onEnterCinema: () => void;
  onOpenSeatSelector: () => void;
  onOpenWatchQueue: () => void;
  onOpenRoomSettings: () => void;
  onToggleVoice: () => void;
  onChangeSourceMode: (mode: WatchSourceMode) => void;
  onChangeVideo: (videoId: string, title: string) => void;
  onLeaveRoom: () => void;
}

export function RoomLobbyView({
  room,
  user,
  members,
  queue,
  hostId,
  sourceMode,
  videoId,
  videoTitle,
  videoQuality,
  syncEnabled,
  inVoice,
  micMuted,
  connectionStatus,
  onBack,
  onEnterCinema,
  onOpenSeatSelector,
  onOpenWatchQueue,
  onOpenRoomSettings,
  onToggleVoice,
  onChangeSourceMode,
  onChangeVideo,
  onLeaveRoom
}: RoomLobbyViewProps) {
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showChangeUrl, setShowChangeUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const isHost = hostId === user.uid;
  const myMember = members.find((m) => m.uid === user.uid);
  const mySeat = myMember?.seatId || user.preferredSeat || 'B3';

  const inviteUrl = `${window.location.origin}/?room=${room.code}`;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(label);
      setTimeout(() => setCopiedNotice(null), 2400);
    } catch {
      setCopiedNotice(`Room Code: ${room.code}`);
      setTimeout(() => setCopiedNotice(null), 3000);
    }
  };

  const handleShareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${room.name} — CineHall YVR`,
          text: `Join my virtual cinema room "${room.name}" on CineHall! Code: ${room.code}`,
          url: inviteUrl
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await copyToClipboard(inviteUrl, 'Invitation link copied');
  };

  const handleUpdateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);
    const parsed = extractYouTubeVideoId(urlInput);
    if (!parsed) {
      setUrlError('Paste a valid YouTube link or 11-character video ID.');
      return;
    }
    const meta = await fetchYouTubeMetadata(parsed);
    onChangeVideo(meta.videoId, meta.title);
    setUrlInput('');
    setShowChangeUrl(false);
  };

  const qualityLabel =
    videoQuality === 'hd1080' ? '1080p' : videoQuality === 'hd720' ? '720p' : videoQuality === 'large' ? '480p' : 'HD';

  return (
    <div className="min-h-screen bg-[#070506] text-[#F5EFEA] pb-28 lg:pb-10">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-50"
        style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% -10%, rgba(158, 27, 50, 0.35), transparent 72%)'
        }}
      />

      {/* Top Header (matches reference middle mockup) */}
      <header className="sticky top-0 z-30 cinema-glass border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Home"
            className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-[#F5EFEA] cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="min-w-0 text-center flex-1">
            <h1 className="text-base sm:text-lg font-bold font-display text-white truncate">{room.name}</h1>
            <p className="text-xs text-[#9E8F8A] truncate">
              {room.isPublic ? 'Public Room' : 'Private Room'} ·{' '}
              <span className="tabular-nums">
                {Math.max(1, members.length)} {Math.max(1, members.length) === 1 ? 'Member' : 'Members'}
              </span>{' '}
              · <span className="font-mono text-[#E5C17B]">{room.code}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 relative">
            <button
              type="button"
              onClick={handleShareInvite}
              aria-label="Share invitation link"
              className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-[#E5DAD6] cursor-pointer"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowMoreMenu((v) => !v)}
              aria-label="More room options"
              className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-[#E5DAD6] cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 rounded-2xl bg-[#160D10] border border-white/12 py-1.5 shadow-2xl z-40">
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(room.code, `Room code ${room.code} copied`);
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs text-[#F5EFEA] hover:bg-white/8 flex items-center gap-2.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-[#E5C17B]" />
                  Copy Code ({room.code})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenRoomSettings();
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs text-[#F5EFEA] hover:bg-white/8 flex items-center gap-2.5 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-[#E5C17B]" />
                  Room Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onLeaveRoom();
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs text-rose-300 hover:bg-rose-500/15 flex items-center gap-2.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Leave Room
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Copy / Connection Toast */}
      {copiedNotice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#1C1216] border border-[#E5C17B]/40 text-xs font-medium text-[#F3DBA8] flex items-center gap-2 shadow-xl">
          <Check className="w-3.5 h-3.5" />
          {copiedNotice}
        </div>
      )}

      {/* Lobby Body */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Watch Source Switcher + Preview + Seat Bar + Audience Strip */}
        <div className="lg:col-span-7 space-y-5">
          {/* Watch Source Selector: YouTube or Built-In Web Browser */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#130B0E] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => onChangeSourceMode('youtube')}
              className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                sourceMode === 'youtube'
                  ? 'bg-[#9E1B32] text-white shadow'
                  : 'text-[#A89A95] hover:text-white'
              }`}
            >
              <span className="w-4 h-3 rounded-[3px] bg-[#FF0000] flex items-center justify-center text-[8px] text-white">
                ▶
              </span>
              YouTube Cinema
            </button>
            <button
              type="button"
              onClick={() => onChangeSourceMode('browser')}
              className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                sourceMode === 'browser'
                  ? 'bg-[#9E1B32] text-white shadow'
                  : 'text-[#A89A95] hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-[#E5C17B]" />
              Web Browser
            </button>
          </div>

          {/* Preview Card (YouTube or Built-In Web Browser) */}
          {sourceMode === 'browser' ? (
            <div
              onClick={onEnterCinema}
              className="group relative aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-[#1C0D12] via-[#10080B] to-[#080506] border border-[#E5C17B]/25 shadow-[0_18px_50px_rgba(0,0,0,0.75)] cursor-pointer flex flex-col items-center justify-center p-5 text-center gap-3"
            >
              <div className="w-13 h-13 rounded-2xl bg-[#9E1B32]/25 border border-[#E5C17B]/35 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Globe className="w-6 h-6 text-[#E5C17B]" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-base sm:text-lg font-bold font-display text-white">
                  Built-In Cinema Browser Ready
                </h3>
                <p className="text-xs text-[#B7A9A4]">
                  Search anything on the web, open websites, and watch together right on your landscape cinema screen.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#F3DBA8] bg-white/[0.06] border border-white/10 px-3 py-1 rounded-full">
                <Search className="w-3 h-3" />
                Tap Enter Cinema to Start Browsing
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div
                onClick={onEnterCinema}
                className="group relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.75)] cursor-pointer"
              >
                <img
                  src={getYouTubeThumbnail(videoId)}
                  alt={videoTitle}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/25" />

                {/* Center Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-black/55 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                  </div>
                </div>

                {/* Bottom Title & YouTube Indicator */}
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-3">
                  <p className="text-xs sm:text-sm font-medium text-white truncate drop-shadow">{videoTitle}</p>
                  <span className="text-[11px] font-semibold text-white/90 flex items-center gap-1 shrink-0 bg-black/60 px-2 py-0.5 rounded-md">
                    <span className="w-2.5 h-2 rounded-[2px] bg-[#FF0000] inline-block" />
                    YouTube
                  </span>
                </div>
              </div>

              {/* Host Change Video Action */}
              {isHost && (
                <div>
                  {!showChangeUrl ? (
                    <button
                      type="button"
                      onClick={() => setShowChangeUrl(true)}
                      className="text-xs text-[#E5C17B] hover:text-[#F3DBA8] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Change YouTube Video
                    </button>
                  ) : (
                    <form onSubmit={handleUpdateVideo} className="space-y-1.5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={urlInput}
                          onChange={(e) => {
                            setUrlInput(e.target.value);
                            setUrlError(null);
                          }}
                          placeholder="Paste YouTube URL..."
                          className="flex-1 h-10 rounded-xl bg-[#180F12] border border-white/12 px-3 text-xs text-white placeholder:text-[#857671] focus:outline-none focus:border-[#E5C17B]/60"
                        />
                        <button
                          type="submit"
                          className="px-3.5 h-10 rounded-xl cinema-cta-gradient text-white text-xs font-semibold cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowChangeUrl(false)}
                          className="px-3 h-10 rounded-xl bg-white/8 text-xs text-[#CFC2BE] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      {urlError && <p className="text-xs text-rose-400">{urlError}</p>}
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Your Seat Row (matches reference image) */}
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-sm font-medium text-[#E5DAD6]">Your Seat</p>
              <p className="text-xs text-[#8E7F7A]">Tap to switch row or pick a Gold Recliner</p>
            </div>
            <button
              type="button"
              onClick={onOpenSeatSelector}
              className="h-11 px-4 rounded-2xl bg-[#191114] hover:bg-[#23171B] border border-[#E5C17B]/30 flex items-center gap-2.5 text-sm font-semibold text-[#F5EFEA] cursor-pointer transition-colors"
            >
              <Armchair className="w-4 h-4 text-[#E5C17B]" />
              <span className="font-mono">{mySeat}</span>
              <Pencil className="w-3.5 h-3.5 text-[#9E8F8A]" />
            </button>
          </div>

          {/* Members Row perched over Plush Red Velvet Seat Silhouettes (Signature Reference Motif!) */}
          <div className="relative rounded-3xl bg-[#120A0D] border border-white/[0.07] pt-5 pb-4 px-4 overflow-hidden">
            <div className="relative z-10 flex items-start gap-4 overflow-x-auto pb-2">
              {members.map((member) => {
                const memberIsHost = member.uid === hostId;
                const isMe = member.uid === user.uid;
                return (
                  <div key={member.uid} className="flex flex-col items-center gap-1.5 shrink-0 w-15 text-center">
                    <Avatar
                      src={member.photoURL}
                      name={member.displayName}
                      size="md"
                      isHost={memberIsHost}
                      isSpeaking={member.isSpeaking}
                      isOnline={member.isOnline}
                    />
                    <div className="leading-tight w-full">
                      {memberIsHost && <span className="block text-[10px] font-semibold text-[#E5C17B]">Host</span>}
                      <span className="block text-xs font-medium text-[#F5EFEA] truncate">
                        {isMe ? 'You' : member.displayName.split(' ')[0]}
                      </span>
                      <span className="block text-[10px] font-mono text-[#8F807B]">{member.seatId}</span>
                    </div>
                  </div>
                );
              })}

              {/* Invite Friend "+" Button */}
              <button
                type="button"
                onClick={handleShareInvite}
                className="flex flex-col items-center gap-1.5 shrink-0 w-15 text-center cursor-pointer group"
              >
                <div className="w-11 h-11 rounded-full bg-white/[0.06] group-hover:bg-white/[0.12] border border-dashed border-white/20 flex items-center justify-center text-[#D8CCC8] transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs text-[#9E8F8A] group-hover:text-white">Invite</span>
              </button>
            </div>

            {/* Subtle Stylized Velvet Cinema Seat Row Backdrop */}
            <div className="pointer-events-none mt-1 flex items-end justify-center gap-1.5 opacity-60" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 flex-1 rounded-t-xl bg-gradient-to-b from-[#6B1224] to-[#26060D] border-t border-[#C8233F]/35"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Controls List Card + Desktop Enter Cinema CTA */}
        <div className="lg:col-span-5 space-y-4">
          {/* Room Controls List Card (matches reference mockup) */}
          <div className="rounded-3xl bg-[#130B0E] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={onOpenWatchQueue}
              className="w-full px-4 py-4 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <ListVideo className="w-5 h-5 text-[#CFC2BE]" />
                <span className="text-sm font-medium text-[#F5EFEA]">Watch Queue</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#9E8F8A]">
                <span className="tabular-nums">
                  {queue.length} {queue.length === 1 ? 'Video' : 'Videos'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenRoomSettings}
              className="w-full px-4 py-4 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-[#CFC2BE]" />
                <span className="text-sm font-medium text-[#F5EFEA]">Room Settings</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#9E8F8A]">
                <span>
                  {qualityLabel} · {syncEnabled ? 'Sync On' : 'Sync Off'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          {/* Connection State & Room Code Card */}
          <div className="rounded-2xl bg-[#120A0D] border border-white/[0.07] p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-[#C8BBB7]">
                {connectionStatus === 'connected'
                  ? 'Real-time sync connected'
                  : connectionStatus === 'reconnecting'
                    ? 'Reconnecting to cinema...'
                    : 'Connecting to cinema...'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void copyToClipboard(room.code, `Copied code ${room.code}`)}
              className="text-xs font-mono text-[#E5C17B] hover:text-[#F3DBA8] flex items-center gap-1 cursor-pointer"
            >
              {room.code}
              <Copy className="w-3 h-3" />
            </button>
          </div>

          {/* Desktop Primary Enter Cinema CTA */}
          <button
            type="button"
            onClick={onEnterCinema}
            className="hidden lg:flex w-full h-14 rounded-2xl cinema-cta-gradient text-white font-semibold text-base items-center justify-center gap-2.5 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Clapperboard className="w-5 h-5" />
            Enter Cinema
          </button>
        </div>
      </main>

      {/* Mobile Sticky Bottom CTA ("Enter Cinema" matching reference) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-4 pt-3 pb-safe bg-gradient-to-t from-[#070506] via-[#070506]/95 to-transparent">
        <div className="max-w-md mx-auto pb-2">
          <button
            type="button"
            onClick={onEnterCinema}
            className="w-full h-13 rounded-2xl cinema-cta-gradient text-white font-semibold text-base flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Clapperboard className="w-5 h-5" />
            Enter Cinema
          </button>
        </div>
      </div>
    </div>
  );
}
