import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, ArrowUp, Check, Film, Loader2, Play, Plus, Trash2, X } from 'lucide-react';
import { CURATED_CINEMA_VIDEOS, extractYouTubeVideoId, fetchYouTubeMetadata, getYouTubeThumbnail } from '../lib/youtube';
import type { QueueItem } from '../types/cinema';

interface WatchQueueModalProps {
  open: boolean;
  onClose: () => void;
  queue: QueueItem[];
  isHost: boolean;
  currentUid: string;
  onAddVideo: (videoId: string, title: string) => Promise<void> | void;
  onRemoveItem: (itemId: string) => void;
  onApproveItem: (itemId: string) => void;
  onReorderItem: (itemId: string, direction: 'up' | 'down') => void;
  onPlayNow: (itemId: string) => void;
}

export function WatchQueueModal({
  open,
  onClose,
  queue,
  isHost,
  currentUid,
  onAddVideo,
  onRemoveItem,
  onApproveItem,
  onReorderItem,
  onPlayNow
}: WatchQueueModalProps) {
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const videoId = extractYouTubeVideoId(urlInput);
    if (!videoId) {
      setError('Paste a valid YouTube video URL or 11-character video ID.');
      return;
    }
    setLoading(true);
    try {
      const meta = await fetchYouTubeMetadata(videoId);
      await onAddVideo(meta.videoId, meta.title);
      setUrlInput('');
    } catch {
      setError('Could not add this video to the queue.');
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
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div>
                <h2 className="text-lg font-semibold font-display text-[#F5EFEA]">Watch Queue</h2>
                <p className="text-xs text-[#9E8F8A]">
                  {queue.length} {queue.length === 1 ? 'video' : 'videos'} lined up
                  {isHost ? ' · Host can reorder & play next' : ' · Host approves upcoming videos'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close watch queue"
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Add YouTube URL Form */}
              <form onSubmit={handleAdd} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Paste YouTube URL or video ID..."
                    className="flex-1 h-11 rounded-xl bg-[#1B1115] border border-white/10 px-3.5 text-sm text-[#F5EFEA] placeholder:text-[#7E6F6B] focus:outline-none focus:border-[#E5C17B]/60"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-11 px-4 rounded-xl cinema-cta-gradient text-white text-sm font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                </div>
                {error && <p className="text-xs text-rose-400">{error}</p>}
              </form>

              {/* Queue List */}
              {queue.length === 0 ? (
                <div className="rounded-2xl bg-[#170E11] border border-white/6 p-6 text-center space-y-2">
                  <Film className="w-7 h-7 text-[#8F7F7A] mx-auto" />
                  <p className="text-sm font-medium text-[#D8CCC8]">No videos in queue yet</p>
                  <p className="text-xs text-[#8F7F7A]">Paste any YouTube link above or pick a film below.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {queue.map((item, idx) => {
                    const canRemove = isHost || item.addedByUid === currentUid;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#180F12] border border-white/8"
                      >
                        <img
                          src={getYouTubeThumbnail(item.videoId)}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-20 h-12 rounded-lg object-cover shrink-0 bg-black"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#F5EFEA] truncate">{item.title}</p>
                          <p className="text-xs text-[#9E8F8A] truncate">
                            Added by {item.addedByName} · {item.status === 'approved' ? 'Approved' : 'Pending host'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isHost && item.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => onApproveItem(item.id)}
                              title="Approve video"
                              className="w-8 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 flex items-center justify-center cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {isHost && (
                            <>
                              <button
                                type="button"
                                onClick={() => onPlayNow(item.id)}
                                title="Play now"
                                className="w-8 h-8 rounded-lg bg-[#9E1B32]/25 hover:bg-[#9E1B32]/40 text-[#F5EFEA] flex items-center justify-center cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => onReorderItem(item.id, 'up')}
                                title="Move up"
                                className="w-7 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-[#C8BBB7] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === queue.length - 1}
                                onClick={() => onReorderItem(item.id, 'down')}
                                title="Move down"
                                className="w-7 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-[#C8BBB7] disabled:opacity-30 flex items-center justify-center cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => onRemoveItem(item.id)}
                              title="Remove from queue"
                              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-[#A89A95] hover:text-rose-300 flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quick Pick Open Cinema Films */}
              <div className="space-y-2.5 pt-2 border-t border-white/8">
                <p className="text-xs font-medium text-[#A89A95]">Quick Add Embeddable Cinema Picks</p>
                <div className="grid grid-cols-1 gap-2">
                  {CURATED_CINEMA_VIDEOS.slice(0, 4).map((pick) => (
                    <button
                      key={pick.videoId}
                      type="button"
                      onClick={() => void onAddVideo(pick.videoId, pick.title)}
                      className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/6 text-left transition-colors cursor-pointer"
                    >
                      <img
                        src={getYouTubeThumbnail(pick.videoId)}
                        alt={pick.title}
                        referrerPolicy="no-referrer"
                        className="w-14 h-9 rounded-md object-cover shrink-0 bg-black"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#F5EFEA] truncate">{pick.title}</p>
                        <p className="text-[11px] text-[#8E7F7A]">
                          {pick.genre} · {pick.duration}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-[#E5C17B] shrink-0 mr-1" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
