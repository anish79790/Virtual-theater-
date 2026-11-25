import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Crown,
  Globe,
  Headphones,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Power,
  Ticket,
  UserMinus,
  Volume2,
  X
} from 'lucide-react';
import { CURATED_CINEMA_VIDEOS, extractYouTubeVideoId, fetchYouTubeMetadata, getYouTubeThumbnail } from '../lib/youtube';
import { sanitizeRoomCode } from '../lib/firestoreService';
import type {
  GraphicsQuality,
  LiveMember,
  RoomSettingsPayload,
  VideoQuality,
  WatchSourceMode
} from '../types/cinema';
import { Avatar } from './Avatar';

/* ========================= Create Room Modal ========================= */
interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (params: {
    name: string;
    isPublic: boolean;
    sourceMode: WatchSourceMode;
    videoId: string;
    videoTitle: string;
    videoQuality: VideoQuality;
    voiceChatEnabled: boolean;
  }) => Promise<void>;
}

export function CreateRoomModal({ open, onClose, onCreate }: CreateRoomModalProps) {
  const [name, setName] = useState('Movie Night');
  const [isPublic, setIsPublic] = useState(false);
  const [sourceMode, setSourceMode] = useState<WatchSourceMode>('youtube');
  const [urlInput, setUrlInput] = useState('');
  const [selectedPickId, setSelectedPickId] = useState(CURATED_CINEMA_VIDEOS[0].videoId);
  const [quality, setQuality] = useState<VideoQuality>('hd1080');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let videoId = selectedPickId;
    let videoTitle = CURATED_CINEMA_VIDEOS.find((v) => v.videoId === selectedPickId)?.title || 'Cinema Feature';

    if (sourceMode === 'youtube' && urlInput.trim()) {
      const parsed = extractYouTubeVideoId(urlInput);
      if (!parsed) {
        setError('Please enter a valid YouTube link or leave blank to use the selected film.');
        return;
      }
      videoId = parsed;
      setSubmitting(true);
      const meta = await fetchYouTubeMetadata(videoId);
      videoTitle = meta.title;
    } else {
      setSubmitting(true);
    }

    try {
      await onCreate({
        name: name.trim() || 'Movie Night',
        isPublic,
        sourceMode,
        videoId,
        videoTitle,
        videoQuality: quality,
        voiceChatEnabled: true
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create cinema room.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold font-display text-[#F5EFEA]">Create Cinema Room</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#B7A9A4]">Room Name</label>
                <input
                  type="text"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Friday Night Premiere"
                  className="w-full h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA] focus:outline-none focus:border-[#E5C17B]/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#B7A9A4]">Room Privacy</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#1B1115] border border-white/8">
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={`h-10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      !isPublic ? 'bg-[#9E1B32] text-white' : 'text-[#A89A95] hover:text-white'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Private Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={`h-10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isPublic ? 'bg-[#9E1B32] text-white' : 'text-[#A89A95] hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Public Hall
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#B7A9A4]">Watch Mode</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#1B1115] border border-white/8">
                  <button
                    type="button"
                    onClick={() => setSourceMode('youtube')}
                    className={`h-10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      sourceMode === 'youtube' ? 'bg-[#9E1B32] text-white' : 'text-[#A89A95] hover:text-white'
                    }`}
                  >
                    <span className="w-3.5 h-2.5 rounded-[2px] bg-[#FF0000] flex items-center justify-center text-[7px] text-white">
                      ▶
                    </span>
                    YouTube
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('browser')}
                    className={`h-10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      sourceMode === 'browser' ? 'bg-[#9E1B32] text-white' : 'text-[#A89A95] hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 text-[#E5C17B]" />
                    Web Browser
                  </button>
                </div>
              </div>

              {sourceMode === 'browser' ? (
                <div className="rounded-xl bg-[#1B1115] border border-[#E5C17B]/25 p-3.5 text-xs text-[#CFC2BE]">
                  Opens the built-in CineHall Browser so you can search anything on the web and watch together. You can switch between YouTube and Browser anytime inside the cinema!
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#B7A9A4]">YouTube Video URL (Optional)</label>
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA] placeholder:text-[#7A6B67] focus:outline-none focus:border-[#E5C17B]/60"
                    />
                  </div>

                  {!urlInput.trim() && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#B7A9A4]">Or Start With Featured Film</label>
                      <div className="grid grid-cols-2 gap-2">
                        {CURATED_CINEMA_VIDEOS.slice(0, 4).map((film) => {
                          const active = selectedPickId === film.videoId;
                          return (
                            <button
                              key={film.videoId}
                              type="button"
                              onClick={() => setSelectedPickId(film.videoId)}
                              className={`rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                                active ? 'border-[#E5C17B] bg-[#221318]' : 'border-white/8 bg-[#180F12]'
                              }`}
                            >
                              <img
                                src={getYouTubeThumbnail(film.videoId)}
                                alt={film.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-16 object-cover bg-black"
                              />
                              <div className="p-2">
                                <p className="text-[11px] font-medium text-[#F5EFEA] truncate">{film.title}</p>
                                <p className="text-[10px] text-[#9E8F8A]">{film.genre} · {film.duration}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1.5 pt-1">
                <label className="text-xs text-[#9E8F8A]">Default Video Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as VideoQuality)}
                  className="w-full h-10 rounded-xl bg-[#1B1115] border border-white/10 px-3 text-xs text-[#F5EFEA]"
                >
                  <option value="hd1080">HD 1080p</option>
                  <option value="hd720">HD 720p</option>
                  <option value="auto">Auto</option>
                  <option value="large">Standard 480p</option>
                </select>
              </div>

              {error && <p className="text-xs text-rose-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl cinema-cta-gradient text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Open Virtual Room (YVR) Lobby
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ========================= Join With Code Modal ========================= */
interface JoinCodeModalProps {
  open: boolean;
  onClose: () => void;
  onJoin: (code: string) => Promise<void>;
}

export function JoinCodeModal({ open, onClose, onJoin }: JoinCodeModalProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = sanitizeRoomCode(input);
    if (code.length !== 6) {
      setError('Enter a 6-character room code or paste a CineHall invitation link.');
      return;
    }
    setLoading(true);
    try {
      await onJoin(code);
      setInput('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Room not found or already closed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Ticket className="w-5 h-5 text-[#E5C17B]" />
                <h2 className="text-lg font-semibold font-display text-[#F5EFEA]">Join with Room Code</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-[#A89A95]">Room Code or Invitation Link</label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. YVR84K or paste invite URL"
                  className="w-full h-12 rounded-xl bg-[#1B1115] border border-white/12 px-4 text-center font-mono text-base tracking-[0.2em] uppercase text-[#F5EFEA] placeholder:tracking-normal placeholder:normal-case placeholder:font-sans placeholder:text-[#7A6B67] focus:outline-none focus:border-[#E5C17B]/60"
                />
              </div>

              {error && <p className="text-xs text-rose-400 text-center">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl cinema-cta-gradient text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enter Room Lobby
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ========================= Schedule Watch Party Modal ========================= */
interface SchedulePartyModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (params: {
    title: string;
    videoId: string;
    videoTitle: string;
    scheduledFor: string;
    isPublic: boolean;
  }) => Promise<void>;
}

export function SchedulePartyModal({ open, onClose, onSchedule }: SchedulePartyModalProps) {
  const defaultDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const [title, setTitle] = useState('Weekend Sci-Fi Night');
  const [urlInput, setUrlInput] = useState('');
  const [scheduledFor, setScheduledFor] = useState(defaultDate);
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let videoId = CURATED_CINEMA_VIDEOS[1].videoId;
    let videoTitle = CURATED_CINEMA_VIDEOS[1].title;

    if (urlInput.trim()) {
      const parsed = extractYouTubeVideoId(urlInput);
      if (!parsed) {
        setError('Enter a valid YouTube URL or leave blank for default.');
        return;
      }
      videoId = parsed;
      setLoading(true);
      const meta = await fetchYouTubeMetadata(videoId);
      videoTitle = meta.title;
    } else {
      setLoading(true);
    }

    try {
      await onSchedule({
        title: title.trim() || 'Watch Party',
        videoId,
        videoTitle,
        scheduledFor,
        isPublic
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule watch party.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#E5C17B]" />
                <h2 className="text-lg font-semibold font-display text-[#F5EFEA]">Schedule Watch Party</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[#B7A9A4]">Event Title</label>
                <input
                  type="text"
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#B7A9A4]">Showtime</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#B7A9A4]">YouTube Video URL (Optional)</label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA] placeholder:text-[#7A6B67]"
                />
              </div>

              <label className="flex items-center justify-between py-2 text-xs text-[#C8BBB7]">
                <span>List in Public Upcoming Watch Parties</span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="accent-[#9E1B32] w-4 h-4"
                />
              </label>

              {error && <p className="text-xs text-rose-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl cinema-cta-gradient text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Schedule & Create Room
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ========================= Room Settings & Host Controls Modal ========================= */
interface RoomSettingsModalProps {
  open: boolean;
  onClose: () => void;
  roomName: string;
  isPublic: boolean;
  quality: VideoQuality;
  graphicsQuality: GraphicsQuality;
  syncEnabled: boolean;
  voiceChatEnabled: boolean;
  isHost: boolean;
  hostId: string;
  currentUid: string;
  members: LiveMember[];
  inVoice: boolean;
  micMuted: boolean;
  voiceError: string | null;
  peerVolumes: Record<string, number>;
  onChangeGraphicsQuality: (q: GraphicsQuality) => void;
  onToggleVoice: () => void;
  onToggleMute: () => void;
  onSetPeerVolume: (peerUid: string, volume: number) => void;
  onSaveSettings: (payload: RoomSettingsPayload) => void;
  onTransferHost: (member: LiveMember) => void;
  onKickMember: (member: LiveMember) => void;
  onCloseRoom: () => void;
}

export function RoomSettingsModal({
  open,
  onClose,
  roomName,
  isPublic,
  quality,
  graphicsQuality,
  syncEnabled,
  voiceChatEnabled,
  isHost,
  hostId,
  currentUid,
  members,
  inVoice,
  micMuted,
  voiceError,
  peerVolumes,
  onChangeGraphicsQuality,
  onToggleVoice,
  onToggleMute,
  onSetPeerVolume,
  onSaveSettings,
  onTransferHost,
  onKickMember,
  onCloseRoom
}: RoomSettingsModalProps) {
  const [name, setName] = useState(roomName);
  const [pub, setPub] = useState(isPublic);
  const [qual, setQual] = useState<VideoQuality>(quality);
  const [sync, setSync] = useState(syncEnabled);
  const [voice, setVoice] = useState(voiceChatEnabled);
  const [confirmClose, setConfirmClose] = useState(false);

  const handleSave = () => {
    onSaveSettings({
      name: name.trim() || roomName,
      isPublic: pub,
      videoQuality: qual,
      syncEnabled: sync,
      voiceChatEnabled: voice
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold font-display text-[#F5EFEA]">Room Settings</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isHost && (
              <p className="text-xs text-[#B7A9A4] bg-white/[0.04] rounded-xl p-3 border border-white/6">
                Viewing room preferences. Only the cinema host can modify sync, visibility, or member permissions.
              </p>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[#9E8F8A]">Cinema Room Name</label>
                <input
                  type="text"
                  disabled={!isHost}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA] disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[#9E8F8A]">Visibility</label>
                  <select
                    disabled={!isHost}
                    value={pub ? 'public' : 'private'}
                    onChange={(e) => setPub(e.target.value === 'public')}
                    className="w-full h-10 rounded-xl bg-[#1B1115] border border-white/10 px-3 text-xs text-[#F5EFEA] disabled:opacity-60"
                  >
                    <option value="private">Private (Code Only)</option>
                    <option value="public">Public Hall</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#9E8F8A]">Target Quality</label>
                  <select
                    disabled={!isHost}
                    value={qual}
                    onChange={(e) => setQual(e.target.value as VideoQuality)}
                    className="w-full h-10 rounded-xl bg-[#1B1115] border border-white/10 px-3 text-xs text-[#F5EFEA] disabled:opacity-60"
                  >
                    <option value="hd1080">HD 1080p</option>
                    <option value="hd720">HD 720p</option>
                    <option value="auto">Auto</option>
                    <option value="large">Standard 480p</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl bg-[#180F12] border border-white/8 divide-y divide-white/6">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#F5EFEA]">Playback Sync</p>
                    <p className="text-xs text-[#8E7F7A]">Keep all viewers aligned to host</p>
                  </div>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => setSync((s) => !s)}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer disabled:opacity-50 ${
                      sync ? 'bg-[#9E1B32]' : 'bg-white/15'
                    }`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${sync ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#F5EFEA]">Allow Room Voice</p>
                    <p className="text-xs text-[#8E7F7A]">Let viewers optionally join voice from Settings</p>
                  </div>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => setVoice((v) => !v)}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer disabled:opacity-50 ${
                      voice ? 'bg-[#9E1B32]' : 'bg-white/15'
                    }`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${voice ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {/* Adaptive Cinema Lighting & Atmosphere Quality */}
              <div className="rounded-2xl bg-[#180F12] border border-white/8 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[#F5EFEA]">Cinema Lighting & Atmosphere</p>
                    <p className="text-[11px] text-[#8E7F7A]">Tune screen glow & auditorium animations for your device</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/45 border border-white/8">
                  {(['low', 'medium', 'high'] as GraphicsQuality[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => onChangeGraphicsQuality(tier)}
                      className={`h-8 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                        graphicsQuality === tier
                          ? 'bg-[#9E1B32] text-white'
                          : 'text-[#A89A95] hover:text-white'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personal Voice Chat Controls */}
              <div className="rounded-2xl bg-[#180F12] border border-white/8 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Headphones className={`w-4 h-4 ${inVoice ? 'text-emerald-400' : 'text-[#A89A95]'}`} />
                    <div>
                      <p className="text-sm font-medium text-[#F5EFEA]">Voice Chat (Optional)</p>
                      <p className="text-[11px] text-[#8E7F7A]">
                        {inVoice ? (micMuted ? 'Connected · Mic muted' : 'Connected · Mic live') : 'Off by default · Join anytime'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleVoice}
                    className={`px-3 h-8 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      inVoice
                        ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                        : 'bg-white/10 hover:bg-white/15 text-white'
                    }`}
                  >
                    {inVoice ? 'Leave' : 'Join'}
                  </button>
                </div>

                {inVoice && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/6">
                    <span className="text-xs text-[#B7A9A4]">Your Microphone</span>
                    <button
                      type="button"
                      onClick={onToggleMute}
                      className={`px-3 h-8 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                        micMuted
                          ? 'bg-rose-500/20 text-rose-200 border border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                      }`}
                    >
                      {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {micMuted ? 'Unmute Mic' : 'Mute Mic'}
                    </button>
                  </div>
                )}

                {voiceError && <p className="text-[11px] text-rose-400">{voiceError}</p>}

                {inVoice && members.filter((m) => m.uid !== currentUid && m.inVoice).length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/6">
                    <p className="text-[11px] text-[#9E8F8A]">Individual Voice Levels</p>
                    {members
                      .filter((m) => m.uid !== currentUid && m.inVoice)
                      .map((peer) => {
                        const pct = Math.round((peerVolumes[peer.uid] ?? 1) * 100);
                        return (
                          <div key={peer.uid} className="flex items-center gap-2">
                            <Volume2 className="w-3.5 h-3.5 text-[#A89A95] shrink-0" />
                            <span className="text-xs text-[#E5DAD6] truncate w-24">{peer.displayName}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={pct}
                              onChange={(e) => onSetPeerVolume(peer.uid, Number(e.target.value) / 100)}
                              className="flex-1 h-1 accent-[#E5C17B] cursor-pointer"
                            />
                            <span className="text-[10px] font-mono tabular-nums text-[#9E8F8A] w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {isHost && members.filter((m) => m.uid !== hostId).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/8">
                  <p className="text-xs font-medium text-[#B7A9A4]">Member Permissions</p>
                  <div className="space-y-2">
                    {members
                      .filter((m) => m.uid !== hostId)
                      .map((member) => (
                        <div
                          key={member.uid}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/6"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar src={member.photoURL} name={member.displayName} size="sm" isOnline={member.isOnline} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#F5EFEA] truncate">{member.displayName}</p>
                              <p className="text-[11px] text-[#8E7F7A] font-mono">Seat {member.seatId}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onTransferHost(member)}
                              title="Make Host"
                              className="px-2.5 h-8 rounded-lg bg-[#E5C17B]/15 hover:bg-[#E5C17B]/25 text-[#E5C17B] text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <Crown className="w-3 h-3" />
                              Host
                            </button>
                            <button
                              type="button"
                              onClick={() => onKickMember(member)}
                              title="Remove member"
                              className="w-8 h-8 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center cursor-pointer"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {isHost && (
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="w-full h-11 rounded-xl cinema-cta-gradient text-white text-sm font-semibold cursor-pointer"
                  >
                    Save Room Settings
                  </button>

                  {!confirmClose ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClose(true)}
                      className="w-full h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Close Cinema Room
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmClose(false)}
                        className="flex-1 h-10 rounded-xl bg-white/8 text-xs text-[#D8CCC8] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onCloseRoom();
                          onClose();
                        }}
                        className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Confirm Close
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ========================= Transfer Host Before Leaving Modal ========================= */
interface TransferHostBeforeLeaveModalProps {
  open: boolean;
  members: LiveMember[];
  currentUid: string;
  onClose: () => void;
  onSelectNewHostAndLeave: (nextHost: LiveMember) => Promise<void> | void;
  onCloseRoomForEveryone: () => void;
}

export function TransferHostBeforeLeaveModal({
  open,
  members,
  currentUid,
  onClose,
  onSelectNewHostAndLeave,
  onCloseRoomForEveryone
}: TransferHostBeforeLeaveModalProps) {
  const [transferringUid, setTransferringUid] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const candidates = members.filter((m) => m.uid !== currentUid);

  const handleSelect = async (member: LiveMember) => {
    setTransferringUid(member.uid);
    try {
      await onSelectNewHostAndLeave(member);
    } finally {
      setTransferringUid(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-[#E5C17B]/25 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#E5C17B]/15 border border-[#E5C17B]/35 text-[#E5C17B] flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold font-display text-[#F5EFEA]">
                    Pass Host Before Leaving
                  </h2>
                  <p className="text-xs text-[#A89A95]">
                    Choose who controls playback after you leave this room.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Stay in room"
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {candidates.map((member) => {
                const isBusy = transferringUid === member.uid;
                return (
                  <button
                    key={member.uid}
                    type="button"
                    disabled={transferringUid !== null}
                    onClick={() => void handleSelect(member)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] hover:bg-[#E5C17B]/12 border border-white/8 hover:border-[#E5C17B]/40 transition-colors text-left cursor-pointer disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={member.photoURL} name={member.displayName} size="sm" isOnline={member.isOnline} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#F5EFEA] truncate">{member.displayName}</p>
                        <p className="text-[11px] text-[#9E8F8A] font-mono">Seat {member.seatId}</p>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-[#E5C17B]/15 border border-[#E5C17B]/35 text-[#E5C17B] text-xs font-semibold flex items-center gap-1.5 shrink-0">
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                      {isBusy ? 'Passing...' : 'Make Host & Leave'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-white/8 space-y-2">
              {!confirmClose ? (
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  className="w-full h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  Close Room for Everyone
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClose(false)}
                    className="flex-1 h-10 rounded-xl bg-white/8 text-xs text-[#D8CCC8] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClose(false);
                      onCloseRoomForEveryone();
                    }}
                    className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Confirm Close Room
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-xl bg-white/6 hover:bg-white/10 text-xs font-medium text-[#D8CCC8] cursor-pointer"
              >
                Stay in Room
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

