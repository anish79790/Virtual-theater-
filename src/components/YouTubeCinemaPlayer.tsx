import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Link2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react';
import { extractYouTubeVideoId, fetchYouTubeMetadata, formatTime } from '../lib/youtube';
import type { PlaybackState, VideoQuality } from '../types/cinema';

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        config: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  loadVideoById: (options: { videoId: string; startSeconds?: number; suggestedQuality?: string }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number; suggestedQuality?: string }) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (vol: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackQuality?: (quality: string) => void;
  destroy: () => void;
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load YouTube Player API.'));
      document.head.appendChild(script);
    }
  });
  return ytApiPromise;
}

function getYouTubeErrorText(code: number): string {
  switch (code) {
    case 2:
      return 'Invalid YouTube video ID. Paste another YouTube link to continue.';
    case 5:
      return 'Your browser could not play this video stream.';
    case 100:
      return 'This YouTube video was removed or marked private.';
    case 101:
    case 150:
      return 'The video owner disabled embedded playback outside YouTube. Pick another video or skip next.';
    default:
      return 'Unable to load this YouTube video. Check your connection or try another video.';
  }
}

interface YouTubeCinemaPlayerProps {
  playback: PlaybackState;
  isHost: boolean;
  focusMode: boolean;
  hasNextInQueue: boolean;
  controlsVisible: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onDoubleTapStage: () => void;
  onStageTap: () => void;
  onHostControl: (payload: {
    action: 'play' | 'pause' | 'seek' | 'videoChange' | 'qualityChange';
    position?: number;
    videoId?: string;
    videoTitle?: string;
    quality?: VideoQuality;
  }) => void;
  onRequestSync: () => void;
  onPlayNextInQueue: () => void;
}

export function YouTubeCinemaPlayer({
  playback,
  isHost,
  focusMode,
  hasNextInQueue,
  controlsVisible,
  isFullscreen,
  onToggleFullscreen,
  onDoubleTapStage,
  onStageTap,
  onHostControl,
  onRequestSync,
  onPlayNextInQueue
}: YouTubeCinemaPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const loadedVideoIdRef = useRef<string>('');
  const isRemoteSyncRef = useRef(false);
  const lastTapRef = useRef<number>(0);

  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(playback.position || 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(85);
  const [muted, setMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [mutedByAutoplay, setMutedByAutoplay] = useState(false);
  const [hostOnlyNotice, setHostOnlyNotice] = useState(false);
  const [showUrlBar, setShowUrlBar] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const playbackRef = useRef(playback);
  const isHostRef = useRef(isHost);
  const onPlayNextRef = useRef(onPlayNextInQueue);

  playbackRef.current = playback;
  isHostRef.current = isHost;
  onPlayNextRef.current = onPlayNextInQueue;

  const computeExpectedPosition = useCallback((state: PlaybackState) => {
    if (!state.isPlaying) return state.position;
    const elapsed = Math.max(0, (Date.now() - state.updatedAt) / 1000);
    return state.position + elapsed * (state.playbackRate || 1);
  }, []);

  // Initialize official YouTube IFrame Player
  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.YT?.Player) return;
        const hostEl = document.createElement('div');
        hostEl.className = 'w-full h-full';
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(hostEl);

        const initial = playbackRef.current;
        loadedVideoIdRef.current = initial.videoId;

        const player = new window.YT.Player(hostEl, {
          videoId: initial.videoId,
          playerVars: {
            autoplay: initial.isPlaying ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setPlayerReady(true);
              setPlayerError(null);
              event.target.setVolume(85);

              const targetPos = computeExpectedPosition(playbackRef.current);
              if (targetPos > 1) {
                isRemoteSyncRef.current = true;
                event.target.seekTo(targetPos, true);
                setTimeout(() => {
                  isRemoteSyncRef.current = false;
                }, 400);
              }
              if (playbackRef.current.isPlaying) {
                event.target.playVideo();
                // Detect browser autoplay block after a short window
                setTimeout(() => {
                  const st = event.target.getPlayerState?.();
                  if (playbackRef.current.isPlaying && st !== 1 && st !== 3) {
                    setAutoplayBlocked(true);
                  }
                }, 1100);
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const YTState = window.YT?.PlayerState;
              if (!YTState) return;
              if (event.data === YTState.PLAYING) {
                setPlayerError(null);
                setAutoplayBlocked(false);
                const dur = event.target.getDuration();
                if (dur > 0) setDuration(dur);
              } else if (event.data === YTState.ENDED && isHostRef.current) {
                onPlayNextRef.current();
              }
            },
            onError: (event) => {
              if (cancelled) return;
              setPlayerError(getYouTubeErrorText(event.data));
            }
          }
        });

        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerError('Could not connect to YouTube Player API. Check network access.');
        }
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // Ignore cleanup errors
      }
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, [computeExpectedPosition]);

  // Synchronize incoming Socket.IO + Firestore playback state to YT Player (strict play/pause lockstep & drift correction)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;
    if (!playback.syncEnabled && !isHost) return;

    const targetPos = computeExpectedPosition(playback);
    isRemoteSyncRef.current = true;
    let autoplayCheckTimer: number | undefined;
    let mutedFallbackTimer: number | undefined;

    try {
      if (loadedVideoIdRef.current !== playback.videoId) {
        loadedVideoIdRef.current = playback.videoId;
        setPlayerError(null);
        if (playback.isPlaying) {
          player.loadVideoById({
            videoId: playback.videoId,
            startSeconds: targetPos,
            suggestedQuality: playback.quality === 'auto' ? 'default' : playback.quality
          });
        } else {
          player.cueVideoById({
            videoId: playback.videoId,
            startSeconds: targetPos,
            suggestedQuality: playback.quality === 'auto' ? 'default' : playback.quality
          });
        }
      } else {
        const localPos = player.getCurrentTime?.() || 0;
        const drift = Math.abs(localPos - targetPos);
        const state = player.getPlayerState?.();

        if (!playback.isPlaying) {
          // Always pause immediately when host pauses, and snap to exact paused frame if drift > 0.8s
          if (state === 1 || state === 3) {
            player.pauseVideo();
          }
          if (drift > 0.8) {
            player.seekTo(targetPos, true);
          }
          setAutoplayBlocked(false);
        } else {
          // Host is playing: correct drift and ensure playback is running
          if (drift > 1.5) {
            player.seekTo(targetPos, true);
          }
          if (state !== 1 && state !== 3) {
            player.playVideo();
            // On mobile/guest browsers, unmuted autoplay can be blocked if user hasn't tapped iframe yet.
            // Fall back to muted playback so video ALWAYS stays in sync with host, with a clear Unmute chip!
            if (!isHost) {
              autoplayCheckTimer = window.setTimeout(() => {
                const currentSt = player.getPlayerState?.();
                if (playbackRef.current.isPlaying && currentSt !== 1 && currentSt !== 3) {
                  try {
                    player.mute();
                    setMuted(true);
                    setMutedByAutoplay(true);
                    player.playVideo();
                  } catch {
                    // Ignore
                  }
                  mutedFallbackTimer = window.setTimeout(() => {
                    const retrySt = player.getPlayerState?.();
                    if (playbackRef.current.isPlaying && retrySt !== 1 && retrySt !== 3) {
                      setAutoplayBlocked(true);
                    }
                  }, 750);
                }
              }, 750);
            }
          }
        }
      }

      if (playback.quality && playback.quality !== 'auto') {
        player.setPlaybackQuality?.(playback.quality);
      }
    } catch {
      // Player might still be initializing
    }

    const timer = window.setTimeout(() => {
      isRemoteSyncRef.current = false;
    }, 450);

    return () => {
      window.clearTimeout(timer);
      if (autoplayCheckTimer) window.clearTimeout(autoplayCheckTimer);
      if (mutedFallbackTimer) window.clearTimeout(mutedFallbackTimer);
    };
  }, [playback, playerReady, isHost, computeExpectedPosition]);

  // Poll playback progress & periodic drift check every 500ms
  useEffect(() => {
    if (!playerReady) return;
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const t = player.getCurrentTime?.() || 0;
        const d = player.getDuration?.() || 0;
        setCurrentTime(t);
        if (d > 0) setDuration(d);

        // Drift correction for synced viewers during active playback
        if (!isHostRef.current && playbackRef.current.syncEnabled && playbackRef.current.isPlaying) {
          const expected = computeExpectedPosition(playbackRef.current);
          if (Math.abs(t - expected) > 2.5) {
            player.seekTo(expected, true);
          }
        }
      } catch {
        // Ignore transient player state read errors
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [playerReady, computeExpectedPosition]);

  const handleTogglePlay = () => {
    const player = playerRef.current;
    if (!isHost) {
      if (autoplayBlocked && player) {
        player.unMute();
        setMuted(false);
        setMutedByAutoplay(false);
        player.playVideo();
        setAutoplayBlocked(false);
        onRequestSync();
        return;
      }
      setHostOnlyNotice(true);
      window.setTimeout(() => setHostOnlyNotice(false), 2200);
      return;
    }
    const pos = player?.getCurrentTime?.() ?? currentTime;
    if (playback.isPlaying) {
      player?.pauseVideo();
      onHostControl({ action: 'pause', position: pos });
    } else {
      player?.playVideo();
      onHostControl({ action: 'play', position: pos });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextPos = Number(e.target.value);
    setCurrentTime(nextPos);
    if (!isHost) return;
    playerRef.current?.seekTo(nextPos, true);
    onHostControl({ action: 'seek', position: nextPos });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = Number(e.target.value);
    setVolume(nextVol);
    if (nextVol === 0) {
      setMuted(true);
      playerRef.current?.mute();
    } else {
      setMuted(false);
      playerRef.current?.unMute();
      playerRef.current?.setVolume(nextVol);
    }
  };

  const handleToggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      player.setVolume(volume || 75);
      setMuted(false);
      setMutedByAutoplay(false);
    } else {
      player.mute();
      setMuted(true);
    }
  };

  const handleLoadUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);
    const vid = extractYouTubeVideoId(urlInput);
    if (!vid) {
      setUrlError('Invalid YouTube URL');
      return;
    }
    const meta = await fetchYouTubeMetadata(vid);
    onHostControl({ action: 'videoChange', videoId: meta.videoId, videoTitle: meta.title });
    setUrlInput('');
    setShowUrlBar(false);
  };

  const handleStagePointerUp = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      onDoubleTapStage();
    } else {
      lastTapRef.current = now;
      onStageTap();
    }
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Official YouTube IFrame Player Mount */}
      <div ref={containerRef} className="w-full h-full pointer-events-none" />

      {/* Transparent Interaction Stage (Double-tap toggles Focus Mode) */}
      <div
        onClick={handleStagePointerUp}
        className="absolute inset-0 z-10 cursor-pointer"
        aria-label="Cinema screen stage"
      />

      {/* Compact Tap-to-Unmute Chip when guest browser required muted autoplay */}
      {mutedByAutoplay && muted && !autoplayBlocked && !playerError && playback.isPlaying && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleMute();
            }}
            className="px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-black/95 border border-[#E5C17B]/50 text-[#F5EFEA] text-xs font-medium flex items-center gap-1.5 shadow-xl cursor-pointer whitespace-nowrap"
          >
            <VolumeX className="w-3.5 h-3.5 text-[#E5C17B]" />
            Tap to Unmute Cinema Audio
          </button>
        </div>
      )}

      {/* Brief Host-Only Playback Notice for Guests */}
      {hostOnlyNotice && !isHost && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="px-3.5 py-1.5 rounded-full bg-black/85 border border-white/15 text-[#F5EFEA] text-xs font-medium shadow-xl whitespace-nowrap">
            Only the Host can play or pause
          </div>
        </div>
      )}

      {/* Autoplay Unlock Prompt (if browser blocks sound/autoplay on late join) */}
      {autoplayBlocked && !playerError && (
        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playerRef.current?.unMute();
              setMuted(false);
              setMutedByAutoplay(false);
              playerRef.current?.playVideo();
              setAutoplayBlocked(false);
              onRequestSync();
            }}
            className="px-5 py-3 rounded-2xl cinema-cta-gradient text-white text-sm font-semibold flex items-center gap-2.5 shadow-2xl cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            Tap to Join Live Playback
          </button>
        </div>
      )}

      {/* Video Unavailable / Non-Embeddable Error Recovery Overlay */}
      {playerError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-30 bg-[#0E070A]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="max-w-sm space-y-1.5">
            <h3 className="text-base font-semibold font-display text-[#F5EFEA]">Video Unavailable in Cinema</h3>
            <p className="text-xs text-[#B7A9A4] leading-relaxed">{playerError}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {isHost && hasNextInQueue && (
              <button
                type="button"
                onClick={onPlayNextInQueue}
                className="px-4 py-2 rounded-xl cinema-cta-gradient text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Play Next in Queue
              </button>
            )}
            {isHost && (
              <button
                type="button"
                onClick={() => setShowUrlBar(true)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#F5EFEA] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                Load Another URL
              </button>
            )}
          </div>
        </div>
      )}

      {/* Host Inline Paste YouTube URL Bar */}
      {showUrlBar && isHost && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 left-3 right-3 z-30 rounded-xl cinema-glass border border-white/15 p-2.5 flex items-center gap-2"
        >
          <form onSubmit={handleLoadUrl} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setUrlError(null);
              }}
              placeholder="Paste YouTube link to play now..."
              className="flex-1 h-9 rounded-lg bg-black/50 border border-white/10 px-3 text-xs text-white placeholder:text-[#9E8F8A] focus:outline-none focus:border-[#E5C17B]"
            />
            <button
              type="submit"
              className="h-9 px-3 rounded-lg cinema-cta-gradient text-white text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              Load
            </button>
            <button
              type="button"
              onClick={() => setShowUrlBar(false)}
              className="h-9 px-2.5 rounded-lg bg-white/10 text-xs text-[#CFC2BE] cursor-pointer"
            >
              Cancel
            </button>
          </form>
          {urlError && <span className="text-[11px] text-rose-400">{urlError}</span>}
        </div>
      )}

      {/* Cinema Screen Playback Controls Bar */}
      {!focusMode && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-0 left-0 right-0 z-20 px-3 sm:px-4 pt-8 pb-2.5 bg-gradient-to-t from-black/90 via-black/55 to-transparent transition-opacity duration-200 ${
            controlsVisible || !playback.isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress Scrubber */}
          <div className="relative group mb-2 flex items-center">
            <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-[#E11D48] transition-all duration-150" style={{ width: `${progressPct}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={1}
              value={Math.min(currentTime, duration || 100)}
              disabled={!isHost}
              onChange={handleSeek}
              aria-label="Video playback progress"
              className={`absolute inset-0 w-full h-4 -top-1.5 opacity-0 ${isHost ? 'cursor-pointer' : 'cursor-default'}`}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={handleTogglePlay}
                title={isHost ? (playback.isPlaying ? 'Pause' : 'Play') : 'Only the Host controls playback'}
                className={`w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0 ${
                  !isHost && !autoplayBlocked ? 'opacity-55' : ''
                }`}
              >
                {playback.isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>

              {isHost && hasNextInQueue && (
                <button
                  type="button"
                  onClick={onPlayNextInQueue}
                  title="Skip to next in queue"
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={muted ? 'Unmute video' : 'Mute video'}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer"
                >
                  {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Video volume"
                  className="hidden sm:block w-16 accent-[#E11D48] h-1 cursor-pointer"
                />
              </div>

              <span className="text-[11px] sm:text-xs font-mono tabular-nums text-white/90 whitespace-nowrap">
                {formatTime(currentTime)} <span className="text-white/45">/</span> {formatTime(duration)}
              </span>

              <span className="hidden md:inline text-xs text-white/65 truncate max-w-[200px]">
                {playback.videoTitle}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 relative">
              {isHost ? (
                <button
                  type="button"
                  onClick={() => setShowUrlBar((v) => !v)}
                  title="Load YouTube URL"
                  className="px-2 h-7 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Link2 className="w-3 h-3" />
                  <span className="hidden sm:inline">URL</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRequestSync}
                  title="Resync with host"
                  className="px-2 h-7 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="hidden sm:inline">Sync</span>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowQualityMenu((v) => !v)}
                  className="px-2 h-7 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-mono uppercase cursor-pointer"
                >
                  {playback.quality === 'hd1080'
                    ? '1080p'
                    : playback.quality === 'hd720'
                      ? '720p'
                      : playback.quality === 'large'
                        ? '480p'
                        : 'HD'}
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-9 right-0 w-28 rounded-xl bg-[#140B0E] border border-white/15 py-1 shadow-xl z-40">
                    {(['auto', 'hd1080', 'hd720', 'large'] as VideoQuality[]).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          if (isHost) onHostControl({ action: 'qualityChange', quality: q });
                          playerRef.current?.setPlaybackQuality?.(q === 'auto' ? 'default' : q);
                          setShowQualityMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 cursor-pointer ${
                          playback.quality === q ? 'text-[#E5C17B] font-semibold' : 'text-white/80'
                        }`}
                      >
                        {q === 'auto' ? 'Auto' : q === 'hd1080' ? '1080p HD' : q === 'hd720' ? '720p HD' : '480p'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
