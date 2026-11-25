import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Armchair,
  ArrowLeft,
  Crown,
  Eye,
  EyeOff,
  Globe,
  Keyboard,
  ListVideo,
  MessageSquare,
  RotateCw,
  Send,
  Settings,
  Smartphone,
  Smile,
  Sparkles,
  Ticket,
  UserMinus,
  Users,
  X
} from 'lucide-react';
import {
  ALLOWED_REACTIONS,
  type ChatMessage,
  type CinemaFocusMode,
  type FloatingReaction,
  type GraphicsQuality,
  type LiveMember,
  type PlaybackState,
  type QueueItem,
  type ReactionEmoji,
  type UserProfile,
  type VideoQuality,
  type WatchSourceMode
} from '../types/cinema';
import {
  isActualLandscape,
  isFullscreenActive,
  lockScreenOrientationLandscape,
  releaseLandscapeCinema,
  requestLandscapeCinema
} from '../lib/orientation';
import { AuditoriumCinemaStage } from './AuditoriumCinemaStage';
import { Avatar } from './Avatar';
import { CinemaBrowserView } from './CinemaBrowserView';
import { CinemaCustomKeyboard } from './CinemaCustomKeyboard';
import { YouTubeCinemaPlayer } from './YouTubeCinemaPlayer';

type ChatKeyboardMode = 'phone' | 'app';

interface VirtualKeyboardLike extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRect;
}

interface NavigatorWithVirtualKeyboard extends Navigator {
  virtualKeyboard?: VirtualKeyboardLike;
}

interface CinemaAuditoriumViewProps {
  roomName: string;
  roomCode: string;
  user: UserProfile;
  hostId: string;
  mySeatId: string;
  members: LiveMember[];
  playback: PlaybackState;
  queue: QueueItem[];
  messages: ChatMessage[];
  typingUsers: { uid: string; displayName: string }[];
  floatingReactions: FloatingReaction[];
  autoLandscape: boolean;
  orientationLockFailed: boolean;
  graphicsQuality: GraphicsQuality;
  inVoice: boolean;
  micMuted: boolean;
  onToggleVoice: () => void;
  onToggleMute: () => void;
  onChangeGraphicsQuality: (q: GraphicsQuality) => void;
  onOpenSeatSelector: () => void;
  onRetryLandscapeLock: () => Promise<void>;
  onExitCinema: () => void;
  onHostPlaybackControl: (payload: {
    action: 'play' | 'pause' | 'seek' | 'videoChange' | 'qualityChange' | 'sourceChange' | 'browserNavigate';
    position?: number;
    videoId?: string;
    videoTitle?: string;
    quality?: VideoQuality;
    sourceMode?: WatchSourceMode;
    browserUrl?: string;
    browserQuery?: string;
  }) => void;
  onChangeSourceMode: (mode: WatchSourceMode, videoId?: string, videoTitle?: string) => void;
  onBrowserNavigate: (url: string, query: string) => void;
  onRequestSync: () => void;
  onPlayNextInQueue: () => void;
  onSendChat: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
  onSendReaction: (emoji: ReactionEmoji) => void;
  onOpenWatchQueue: () => void;
  onOpenSettings: () => void;
  onTransferHost: (member: LiveMember) => void;
  onKickMember: (member: LiveMember) => void;
}

interface ViewportMetrics {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  windowWidth: number;
  windowHeight: number;
  vkOverlayHeight: number;
  isLandscape: boolean;
}

const CHAT_QUICK_EMOJIS = ['❤️', '😂', '🔥', '😮', '👏', '🍿', '🎬', '😍'];

function readViewportMetrics(): ViewportMetrics {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: 720,
      offsetTop: 0,
      offsetLeft: 0,
      windowWidth: 1280,
      windowHeight: 720,
      vkOverlayHeight: 0,
      isLandscape: true
    };
  }
  const vv = window.visualViewport;
  const vk = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
  const vkOverlayHeight =
    vk && vk.overlaysContent && vk.boundingRect ? Math.max(0, Math.round(vk.boundingRect.height)) : 0;

  return {
    width: vv ? Math.round(vv.width) : window.innerWidth,
    height: vv ? Math.round(vv.height) : window.innerHeight,
    offsetTop: vv ? Math.round(vv.offsetTop) : 0,
    offsetLeft: vv ? Math.round(vv.offsetLeft) : 0,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    vkOverlayHeight,
    isLandscape: isActualLandscape()
  };
}

function readSavedKeyboardMode(): ChatKeyboardMode {
  if (typeof window === 'undefined') return 'phone';
  try {
    const saved = window.localStorage.getItem('cinehall_keyboard_mode');
    if (saved === 'app' || saved === 'phone') return saved;
  } catch {
    // Ignore storage restriction
  }
  return 'phone';
}

export function CinemaAuditoriumView({
  roomName,
  roomCode,
  user,
  hostId,
  mySeatId,
  members,
  playback,
  queue,
  messages,
  typingUsers,
  floatingReactions,
  autoLandscape,
  orientationLockFailed,
  graphicsQuality,
  onChangeGraphicsQuality,
  onOpenSeatSelector,
  onRetryLandscapeLock,
  onExitCinema,
  onHostPlaybackControl,
  onChangeSourceMode,
  onBrowserNavigate,
  onRequestSync,
  onPlayNextInQueue,
  onSendChat,
  onTyping,
  onSendReaction,
  onOpenWatchQueue,
  onOpenSettings,
  onTransferHost,
  onKickMember
}: CinemaAuditoriumViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set(messages.map((m) => m.id)));

  const [focusMode, setFocusMode] = useState<CinemaFocusMode>('normal');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(() => isFullscreenActive());
  const [viewport, setViewport] = useState<ViewportMetrics>(() => readViewportMetrics());
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [keyboardMode, setKeyboardMode] = useState<ChatKeyboardMode>(() => readSavedKeyboardMode());
  const [appKeyboardOpen, setAppKeyboardOpen] = useState(true);
  const [chatInputFocused, setChatInputFocused] = useState(false);
  const [showEmojiStrip, setShowEmojiStrip] = useState(false);
  const [floatingBubbles, setFloatingBubbles] = useState<ChatMessage[]>([]);
  const [focusHintVisible, setFocusHintVisible] = useState(false);
  const [rotateBannerDismissed, setRotateBannerDismissed] = useState(false);
  const [showEntranceTicket, setShowEntranceTicket] = useState(true);

  const isHost = hostId === user.uid;
  const sourceMode: WatchSourceMode = playback.sourceMode === 'browser' ? 'browser' : 'youtube';

  // Detect genuine hardware orientation (ZERO CSS rotate(90deg)!)
  const isLandscape = viewport.isLandscape;
  const isPortraitDevice = !isLandscape && viewport.windowWidth < 900;

  // Usable visual height above the native phone keyboard (supports both Android VirtualKeyboard overlay & visualViewport resize)
  const usableHeight = Math.max(200, viewport.height - viewport.vkOverlayHeight);
  const vvKeyboardShrink = Math.max(0, viewport.windowHeight - viewport.height);
  const nativeKeyboardHeight = Math.max(viewport.vkOverlayHeight, vvKeyboardShrink);
  const isNativeKeyboardOpen =
    keyboardMode === 'phone' &&
    (nativeKeyboardHeight > 70 || (chatInputFocused && (isLandscape ? usableHeight < 300 : usableHeight < 520)));

  const isCompactHeight = isLandscape && usableHeight < 340;
  const hasRightSidePanel = isLandscape && (focusMode === 'chat' || showMembersPanel);
  const isPortraitPanelOpen = isPortraitDevice && (focusMode === 'chat' || showMembersPanel);

  // Clean right-side drawer width leaving maximum room for the photorealistic cinema screen on the left
  const sidePanelWidth = Math.min(340, Math.max(240, Math.round(viewport.width * 0.35)));

  // Guaranteed visible top cinema video height in Portrait mode so typing NEVER hides the movie screen!
  const portraitVideoHeight = (() => {
    if (!isPortraitPanelOpen) return 0;
    const ideal16x9 = Math.round((viewport.width * 9) / 16);
    if (isNativeKeyboardOpen) {
      // With portrait native keyboard open, pin a crisp visible 16:9 theater screen at the top (~44-48% of remaining viewport)
      return Math.max(138, Math.min(ideal16x9, Math.round(usableHeight * 0.46)));
    }
    if (focusMode === 'chat' && keyboardMode === 'app' && appKeyboardOpen) {
      return Math.max(150, Math.min(ideal16x9, Math.round(usableHeight * 0.36)));
    }
    return Math.max(170, Math.min(ideal16x9, Math.round(usableHeight * 0.42)));
  })();

  // Auto-dismiss digital PVR admission ticket smoothly after 1.9s
  useEffect(() => {
    const timer = window.setTimeout(() => setShowEntranceTicket(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  // Enable Android Chrome VirtualKeyboard overlay mode so native keyboard never crushes/flips the cinema layout
  useEffect(() => {
    const nav = navigator as NavigatorWithVirtualKeyboard;
    const vk = nav.virtualKeyboard;
    if (!vk) return;

    const prevOverlays = vk.overlaysContent;
    try {
      vk.overlaysContent = true;
    } catch {
      // Ignore if browser forbids setting overlaysContent
    }

    const handleGeometryChange = () => {
      window.scrollTo(0, 0);
      setViewport(readViewportMetrics());
    };
    vk.addEventListener('geometrychange', handleGeometryChange);

    return () => {
      vk.removeEventListener('geometrychange', handleGeometryChange);
      try {
        vk.overlaysContent = prevOverlays;
      } catch {
        // Ignore cleanup error
      }
    };
  }, []);

  // Listen to visualViewport, orientationchange, and fullscreenchange (with scroll-to-top guard for portrait keyboard)
  useEffect(() => {
    const syncViewport = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      const next = readViewportMetrics();
      setViewport(next);
      if (next.isLandscape) {
        setRotateBannerDismissed(false);
      }
    };

    const handleOrientationChange = () => {
      syncViewport();
      window.setTimeout(syncViewport, 220);
    };

    const handleFsChange = () => {
      const fsActive = isFullscreenActive();
      setIsFullscreen(fsActive);
      if (fsActive && autoLandscape && !isActualLandscape()) {
        void lockScreenOrientationLandscape();
      }
      syncViewport();
      window.setTimeout(syncViewport, 200);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', handleOrientationChange);
    window.screen?.orientation?.addEventListener?.('change', handleOrientationChange);
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.screen?.orientation?.removeEventListener?.('change', handleOrientationChange);
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [autoLandscape]);

  // Release fullscreen & orientation lock ONLY on unmount (returning to portrait lobby)
  useEffect(() => {
    return () => {
      releaseLandscapeCinema();
    };
  }, []);

  // Track compact floating chat bubble(s) with 8s auto-fade (max 2 visible at once)
  useEffect(() => {
    const newlyArrived = messages.filter((m) => !seenMessageIdsRef.current.has(m.id));
    if (newlyArrived.length === 0) return;

    newlyArrived.forEach((msg) => {
      seenMessageIdsRef.current.add(msg.id);
      setFloatingBubbles((prev) => [...prev.filter((b) => b.id !== msg.id), msg].slice(-2));
      window.setTimeout(() => {
        setFloatingBubbles((prev) => prev.filter((b) => b.id !== msg.id));
      }, 8000);
    });
  }, [messages]);

  // Keep latest messages visible in chat drawer whenever messages arrive or keyboard toggles
  useEffect(() => {
    if (focusMode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, focusMode, isNativeKeyboardOpen, keyboardMode, appKeyboardOpen]);

  const handleSelectKeyboardMode = (mode: ChatKeyboardMode) => {
    setKeyboardMode(mode);
    try {
      window.localStorage.setItem('cinehall_keyboard_mode', mode);
    } catch {
      // Ignore storage errors
    }
    if (mode === 'app') {
      chatInputRef.current?.blur();
      setChatInputFocused(false);
      setAppKeyboardOpen(true);
    } else {
      window.setTimeout(() => {
        chatInputRef.current?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }, 60);
    }
  };

  const handleExitCinemaClick = useCallback(() => {
    releaseLandscapeCinema();
    onExitCinema();
  }, [onExitCinema]);

  const revealControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 4500);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = prev === 'focus' ? 'normal' : 'focus';
      if (next === 'focus') {
        setShowMembersPanel(false);
        setFocusHintVisible(true);
        window.setTimeout(() => setFocusHintVisible(false), 2200);
      } else {
        revealControlsTemporarily();
      }
      return next;
    });
  }, [revealControlsTemporarily]);

  const handleToggleFullscreen = async () => {
    try {
      if (!isFullscreenActive()) {
        const result = await requestLandscapeCinema(autoLandscape);
        setIsFullscreen(result.fullscreenEntered || isFullscreenActive());
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Ignore browser restriction
    }
  };

  const handleChatChange = (val: string) => {
    setChatInput(val);
    onTyping(Boolean(val.trim()));
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (val.trim()) {
      typingTimeoutRef.current = window.setTimeout(() => onTyping(false), 2400);
    }
  };

  const handleSendCurrentMessage = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = chatInput.trim();
      if (!trimmed) return;
      onSendChat(trimmed);
      setChatInput('');
      onTyping(false);
      if (keyboardMode === 'phone') {
        chatInputRef.current?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
    },
    [chatInput, keyboardMode, onSendChat, onTyping]
  );

  const openChatPanel = (focusComposer = false) => {
    setShowMembersPanel(false);
    if (focusMode === 'chat' && !focusComposer) {
      chatInputRef.current?.blur();
      setFocusMode('normal');
      return;
    }
    setFocusMode('chat');
    if (focusComposer) {
      if (keyboardMode === 'app') {
        setAppKeyboardOpen(true);
      } else {
        window.setTimeout(() => {
          chatInputRef.current?.focus({ preventScroll: true });
          window.scrollTo(0, 0);
        }, 220);
      }
    }
  };

  const openMembersPanel = () => {
    if (focusMode === 'chat') {
      chatInputRef.current?.blur();
      setFocusMode('normal');
    }
    setShowMembersPanel((v) => !v);
  };

  const showFloatingBubbles =
    focusMode === 'normal' && !showMembersPanel && floatingBubbles.length > 0;
  const showManualRotateFallback =
    isPortraitDevice && !isPortraitPanelOpen && !rotateBannerDismissed && focusMode !== 'focus';

  // Hide floating top header only when keyboard squeezes height so the movie screen ALWAYS remains 100% unobstructed
  const showTopHeader =
    focusMode !== 'focus' &&
    !(isNativeKeyboardOpen && (isCompactHeight || (isPortraitPanelOpen && usableHeight < 460)));

  return (
    <div
      className="fixed z-50 bg-[#050304] overflow-hidden overscroll-none"
      style={{
        top: `${viewport.offsetTop}px`,
        left: `${viewport.offsetLeft}px`,
        width: `${viewport.width}px`,
        height: `${usableHeight}px`
      }}
    >
      <div
        ref={rootRef}
        onMouseMove={revealControlsTemporarily}
        className="w-full h-full relative px-safe bg-[#050304] text-[#F5EFEA] overflow-hidden flex flex-col"
      >
        {/* === TOP CINEMA HEADER (Clean — Voice Chat Hidden Inside Settings!) === */}
        <AnimatePresence>
          {showTopHeader && (
            <motion.header
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: controlsVisible || hasRightSidePanel || isPortraitPanelOpen ? 1 : 0.88, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
              className={`${
                isPortraitPanelOpen
                  ? 'relative z-30 shrink-0 bg-[#090406] border-b border-white/10 px-2.5 py-1.5'
                  : `absolute top-0 left-0 z-30 px-2.5 sm:px-4 ${isCompactHeight ? 'pt-1 pb-1' : 'pt-2 pb-1.5'} pointer-events-none`
              } flex items-center justify-between gap-2`}
              style={
                isPortraitPanelOpen
                  ? undefined
                  : {
                      background:
                        'linear-gradient(to bottom, rgba(5,3,4,0.78) 0%, rgba(5,3,4,0.28) 70%, transparent 100%)',
                      right: hasRightSidePanel ? `${sidePanelWidth}px` : '0px'
                    }
              }
            >
              {/* Left: Exit Cinema + Room Name + Live Seat Count */}
              <div className="flex items-center gap-2 min-w-0 pointer-events-auto">
                <button
                  type="button"
                  onClick={handleExitCinemaClick}
                  aria-label="Exit Cinema to room lobby"
                  title="Exit Cinema"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#12090D]/85 border border-white/15 hover:bg-[#221118] flex items-center justify-center text-white cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold font-display text-white truncate drop-shadow leading-tight">
                    {roomName}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-[11px] text-emerald-300 font-medium tabular-nums whitespace-nowrap">
                      {members.length} Seated · Seat {mySeatId}
                    </span>
                    <div className="hidden md:flex items-center -space-x-1.5">
                      {members.slice(0, 4).map((m) => (
                        <Avatar
                          key={m.uid}
                          src={m.photoURL}
                          name={m.displayName}
                          size="xs"
                          isHost={m.uid === hostId}
                          isSpeaking={m.isSpeaking}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Center: YouTube | Browser Mode Switcher */}
              <div className="flex items-center rounded-full bg-[#12090D]/85 border border-white/15 p-0.5 shrink-0 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => onChangeSourceMode('youtube')}
                  className={`px-2 sm:px-3 h-7 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    sourceMode === 'youtube'
                      ? 'bg-[#9E1B32] text-white'
                      : 'text-[#CFC2BE] hover:text-white'
                  }`}
                >
                  <span className="w-3.5 h-2.5 rounded-[2px] bg-[#FF0000] flex items-center justify-center text-[7px] text-white shrink-0">
                    ▶
                  </span>
                  <span className={isPortraitPanelOpen ? 'hidden sm:inline' : ''}>YouTube</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSourceMode('browser')}
                  className={`px-2 sm:px-3 h-7 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    sourceMode === 'browser'
                      ? 'bg-[#9E1B32] text-white'
                      : 'text-[#CFC2BE] hover:text-white'
                  }`}
                >
                  <Globe className="w-3 h-3 text-[#E5C17B] shrink-0" />
                  <span className={isPortraitPanelOpen ? 'hidden sm:inline' : ''}>Browser</span>
                </button>
              </div>

              {/* Right: Cinema Controls (Chat, Audience/Seats, Queue, Focus, Settings — Voice is inside Settings) */}
              <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => openChatPanel(false)}
                  title="Live Cinema Chat"
                  className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                    focusMode === 'chat'
                      ? 'bg-[#2A141C] border-[#E5C17B] text-[#E5C17B]'
                      : 'bg-[#12090D]/85 border-white/15 text-white hover:bg-[#221118]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <button
                  type="button"
                  onClick={openMembersPanel}
                  title="Audience & Cinema Seats"
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                    showMembersPanel
                      ? 'bg-[#2A141C] border-[#E5C17B] text-[#E5C17B]'
                      : 'bg-[#12090D]/85 border-white/15 text-white hover:bg-[#221118]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <button
                  type="button"
                  onClick={onOpenWatchQueue}
                  title="Watch Queue"
                  className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#12090D]/85 border border-white/15 text-white hover:bg-[#221118] flex items-center justify-center cursor-pointer"
                >
                  <ListVideo className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {queue.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#C8233F] text-[9px] font-bold flex items-center justify-center">
                      {queue.length}
                    </span>
                  )}
                </button>

                {!isPortraitPanelOpen && (
                  <button
                    type="button"
                    onClick={toggleFocusMode}
                    title="Focus Cinema Mode (IMAX Full Screen)"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#12090D]/85 border border-white/15 text-white hover:bg-[#221118] flex items-center justify-center cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenSettings}
                  title="Room Settings"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#12090D]/85 border border-white/15 text-white hover:bg-[#221118] flex items-center justify-center cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </motion.header>
          )}
        </AnimatePresence>

        {/* === MANUAL ROTATION FALLBACK BANNER (Shown ONLY if mobile OS blocked auto orientation lock) === */}
        <AnimatePresence>
          {showManualRotateFallback && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="absolute top-12 left-3 right-3 z-40"
            >
              <div className="rounded-xl bg-[#140A0E]/95 border border-[#E5C17B]/40 px-3 py-2 flex items-center justify-between gap-2.5 shadow-2xl">
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="w-4 h-4 text-[#E5C17B] rotate-90 shrink-0" />
                  <p className="text-[11px] text-[#F5EFEA] leading-snug">
                    {orientationLockFailed
                      ? 'Tap Rotate Cinema or turn your phone sideways for full widescreen YVR view.'
                      : 'Tap Rotate Cinema to switch into landscape auditorium mode.'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onRetryLandscapeLock()}
                    className="px-2.5 h-7 rounded-lg cinema-cta-gradient text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCw className="w-3 h-3" />
                    Rotate Cinema
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotateBannerDismissed(true)}
                    aria-label="Dismiss rotate notice"
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/15 text-[#CFC2BE] flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* === MAIN CINEMA LAYOUT: PHOTOREALISTIC PVR AUDITORIUM + SIDE/BOTTOM CHAT OR AUDIENCE === */}
        <div
          className={`relative z-20 flex-1 min-h-0 flex ${
            isPortraitDevice ? 'flex-col' : 'flex-row'
          } overflow-hidden`}
        >
          {/* PHOTOREALISTIC CINEMA HALL + PIXEL-LOCKED YOUTUBE SCREEN + REAL SEATED FRIENDS */}
          <div
            className={`relative min-w-0 overflow-hidden bg-black ${
              isPortraitPanelOpen ? 'w-full flex-none shrink-0 border-b border-white/10' : 'flex-1 min-h-0'
            }`}
            style={isPortraitPanelOpen ? { height: `${portraitVideoHeight}px` } : undefined}
          >
            <AuditoriumCinemaStage
              members={members}
              hostId={hostId}
              currentUserId={user.uid}
              isPlaying={playback.isPlaying}
              focusMode={focusMode}
              hasRightPanel={hasRightSidePanel}
              keyboardOpen={isNativeKeyboardOpen}
              isPortraitDevice={isPortraitDevice}
              portraitCompact={isPortraitPanelOpen}
              floatingReactions={floatingReactions}
              graphicsQuality={graphicsQuality}
            >
              {sourceMode === 'browser' ? (
                <CinemaBrowserView
                  browserUrl={playback.browserUrl || ''}
                  browserQuery={playback.browserQuery || ''}
                  isHost={isHost}
                  focusMode={focusMode === 'focus'}
                  onNavigate={onBrowserNavigate}
                  onSwitchToYouTube={(videoId, title) => onChangeSourceMode('youtube', videoId, title)}
                  onStageTap={revealControlsTemporarily}
                />
              ) : (
                <YouTubeCinemaPlayer
                  playback={playback}
                  isHost={isHost}
                  focusMode={focusMode === 'focus'}
                  hasNextInQueue={queue.length > 0}
                  controlsVisible={controlsVisible}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={handleToggleFullscreen}
                  onDoubleTapStage={toggleFocusMode}
                  onStageTap={revealControlsTemporarily}
                  onHostControl={onHostPlaybackControl}
                  onRequestSync={onRequestSync}
                  onPlayNextInQueue={onPlayNextInQueue}
                />
              )}
            </AuditoriumCinemaStage>

            {/* COMPACT FLOATING CHAT BUBBLES (Lower-Left, Auto-Fading, Max 2) */}
            {showFloatingBubbles && (
              <div className="pointer-events-none absolute left-2.5 sm:left-4 bottom-12 sm:bottom-14 z-30 flex flex-col gap-1.5 w-[205px] sm:w-[240px] max-w-[54%]">
                <AnimatePresence initial={false}>
                  {floatingBubbles.map((msg) => (
                    <motion.button
                      key={msg.id}
                      type="button"
                      layout
                      initial={{ opacity: 0, y: 10, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.94 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => openChatPanel(true)}
                      className="pointer-events-auto w-full rounded-xl bg-[#0F080B]/88 border border-white/14 px-2 py-1.5 flex items-center gap-2 text-left shadow-lg hover:border-[#E5C17B]/45 transition-colors cursor-pointer"
                    >
                      <Avatar src={msg.senderAvatar} name={msg.senderName} size="xs" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span className="text-[10px] font-semibold text-white/95 truncate">
                            {msg.senderName}
                          </span>
                          <span className="text-[9px] font-mono tabular-nums text-white/55 shrink-0">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#E9DFDB] truncate mt-0.5">{msg.text}</p>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* COMPACT NORMAL-MODE BOTTOM DOCK OVER FOREGROUND VELVET SEATS */}
            {focusMode === 'normal' && !isPortraitPanelOpen && (
              <div
                className={`absolute bottom-0 left-0 right-0 z-30 px-2.5 sm:px-4 ${
                  isCompactHeight ? 'pb-1.5 pt-2' : 'pb-2 sm:pb-3 pt-4'
                } flex items-center justify-between gap-2 pointer-events-none`}
                style={{
                  background: 'linear-gradient(to top, rgba(5,2,3,0.82) 0%, rgba(5,2,3,0.28) 65%, transparent 100%)'
                }}
              >
                <div className="flex items-center gap-1.5 flex-1 max-w-sm min-w-0 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => openChatPanel(true)}
                    className="flex-1 h-9 rounded-full bg-[#12090D]/88 border border-white/15 hover:border-[#E5C17B]/50 px-3 flex items-center justify-between gap-2 text-left cursor-pointer min-w-0 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare className="w-3.5 h-3.5 text-[#E5C17B] shrink-0" />
                      <span className="text-xs text-[#CFC2BE] truncate">
                        {chatInput || 'Say something...'}
                      </span>
                    </div>
                    {messages.length > 0 && (
                      <span className="min-w-[18px] h-4 px-1 rounded-full bg-[#9E1B32] text-[9px] font-bold text-white flex items-center justify-center tabular-nums shrink-0">
                        {messages.length > 99 ? '99+' : messages.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Quick Cinema Reactions (Float Directly Above Your Seat In The Auditorium!) */}
                <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
                  {ALLOWED_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onSendReaction(emoji)}
                      aria-label={`React with ${emoji}`}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#12090D]/88 border border-white/14 hover:border-[#E5C17B]/45 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center text-base sm:text-lg cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* === CHAT PANEL (RIGHT SIDE IN LANDSCAPE, PINNED BELOW VIDEO IN PORTRAIT) WITH PHONE / APP KEYBOARD OPTION === */}
          <AnimatePresence initial={false}>
            {focusMode === 'chat' && (
              <motion.aside
                key="cinema-chat-drawer"
                initial={isPortraitDevice ? { opacity: 0, y: 12 } : { width: 0, opacity: 0 }}
                animate={isPortraitDevice ? { opacity: 1, y: 0 } : { width: sidePanelWidth, opacity: 1 }}
                exit={isPortraitDevice ? { opacity: 0, y: 12 } : { width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={
                  isPortraitDevice
                    ? 'flex-1 min-h-0 w-full bg-[#0D0609] overflow-hidden flex flex-col'
                    : 'h-full shrink-0 border-l border-white/12 bg-[#0D0609]/96 overflow-hidden'
                }
              >
                <div
                  className="h-full w-full flex flex-col min-h-0"
                  style={isPortraitDevice ? undefined : { width: `${sidePanelWidth}px` }}
                >
                  {/* Chat Header + 1-Tap Keyboard Mode Selector (Phone Keyboard | App Keyboard) */}
                  <div
                    className={`px-2.5 border-b border-white/10 flex items-center justify-between gap-1.5 shrink-0 ${
                      isNativeKeyboardOpen ? 'py-1' : 'py-1.5'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <h3 className="text-xs font-semibold font-display text-white truncate">Chat</h3>
                      <span className="text-[10px] text-[#9E8F8A] tabular-nums shrink-0">
                        · {members.length}
                      </span>
                    </div>

                    {/* Keyboard Switcher: Phone Native Keyboard vs CineHall Built-in App Keyboard */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        role="group"
                        aria-label="Choose chat keyboard"
                        className="flex items-center rounded-full bg-black/55 border border-white/12 p-0.5"
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectKeyboardMode('phone')}
                          title="Use your phone's native keyboard"
                          className={`px-2 h-6 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                            keyboardMode === 'phone'
                              ? 'bg-[#9E1B32] text-white'
                              : 'text-[#B7A9A4] hover:text-white'
                          }`}
                        >
                          <Smartphone className="w-2.5 h-2.5 shrink-0" />
                          <span>Phone</span>
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectKeyboardMode('app')}
                          title="Use CineHall built-in keyboard"
                          className={`px-2 h-6 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                            keyboardMode === 'app'
                              ? 'bg-[#9E1B32] text-white'
                              : 'text-[#B7A9A4] hover:text-white'
                          }`}
                        >
                          <Keyboard className="w-2.5 h-2.5 shrink-0" />
                          <span>App</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          chatInputRef.current?.blur();
                          setFocusMode('normal');
                        }}
                        aria-label="Close chat panel"
                        className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Chat Messages */}
                  <div className="flex-1 min-h-0 overflow-y-auto touch-scroll px-2.5 py-1.5 space-y-2">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[#8E7F7A] space-y-1 px-3">
                        <MessageSquare className="w-5 h-5 opacity-60" />
                        <p>Chat live with friends seated in your cinema hall.</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const mine = msg.senderUid === user.uid;
                        return (
                          <div
                            key={msg.id}
                            className={`flex items-start gap-1.5 ${mine ? 'flex-row-reverse text-right' : ''}`}
                          >
                            <Avatar src={msg.senderAvatar} name={msg.senderName} size="xs" />
                            <div className="max-w-[82%] space-y-0.5">
                              <div
                                className={`flex items-baseline gap-1 text-[10px] text-[#9E8F8A] ${
                                  mine ? 'justify-end' : ''
                                }`}
                              >
                                <span className="font-medium text-[#E5DAD6] truncate">
                                  {mine ? 'You' : msg.senderName}
                                </span>
                                <span className="font-mono tabular-nums shrink-0">
                                  {new Date(msg.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                              <div
                                className={`inline-block rounded-2xl px-2.5 py-1.5 text-xs leading-snug break-words ${
                                  mine
                                    ? 'bg-[#9E1B32] text-white rounded-tr-sm'
                                    : 'bg-white/10 text-[#F5EFEA] rounded-tl-sm'
                                }`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {typingUsers.length > 0 && (
                    <div className="px-3 py-0.5 text-[10px] text-[#E5C17B] italic shrink-0">
                      {typingUsers.map((u) => u.displayName.split(' ')[0]).join(', ')} typing...
                    </div>
                  )}

                  {/* Active Keyboard Composer: Phone Native Keyboard OR CineHall Built-in App Keyboard */}
                  {keyboardMode === 'app' ? (
                    <CinemaCustomKeyboard
                      value={chatInput}
                      isOpen={appKeyboardOpen}
                      compact={isCompactHeight || (isLandscape && usableHeight < 420)}
                      onChange={handleChatChange}
                      onSend={() => handleSendCurrentMessage()}
                      onToggleOpen={() => setAppKeyboardOpen((v) => !v)}
                    />
                  ) : (
                    <>
                      {showEmojiStrip && (
                        <div className="px-2 py-1 border-t border-white/8 bg-[#12080C] flex items-center justify-between gap-1 shrink-0">
                          {CHAT_QUICK_EMOJIS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                handleChatChange(`${chatInput}${em}`);
                                chatInputRef.current?.focus({ preventScroll: true });
                              }}
                              className="w-7 h-7 rounded-lg hover:bg-white/10 active:scale-95 flex items-center justify-center text-sm cursor-pointer"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      )}

                      <form
                        onSubmit={handleSendCurrentMessage}
                        className="p-2 border-t border-white/10 bg-[#140A0E] flex items-center gap-1.5 shrink-0"
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowEmojiStrip((v) => !v)}
                          aria-label="Toggle quick emojis"
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                            showEmojiStrip
                              ? 'bg-[#9E1B32]/30 text-[#E5C17B]'
                              : 'bg-white/8 text-[#CFC2BE] hover:text-white'
                          }`}
                        >
                          <Smile className="w-4 h-4" />
                        </button>

                        <input
                          ref={chatInputRef}
                          type="text"
                          value={chatInput}
                          onChange={(e) => handleChatChange(e.target.value)}
                          onFocus={() => {
                            setChatInputFocused(true);
                            window.scrollTo(0, 0);
                            window.setTimeout(() => window.scrollTo(0, 0), 120);
                          }}
                          onBlur={() => setChatInputFocused(false)}
                          placeholder="Type a message..."
                          enterKeyHint="send"
                          inputMode="text"
                          autoComplete="off"
                          autoCorrect="on"
                          spellCheck={true}
                          maxLength={360}
                          className="flex-1 min-w-0 h-9 rounded-full bg-black/55 border border-white/15 focus:border-[#E5C17B]/70 px-3 text-xs text-white placeholder:text-[#8E7F7A] focus:outline-none"
                        />

                        <button
                          type="submit"
                          disabled={!chatInput.trim()}
                          onMouseDown={(e) => e.preventDefault()}
                          aria-label="Send chat message"
                          className="w-9 h-9 rounded-full cinema-cta-gradient text-white flex items-center justify-center shrink-0 disabled:opacity-40 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </motion.aside>
            )}

            {/* === AUDIENCE & CINEMA SEATS PANEL === */}
            {showMembersPanel && (
              <motion.aside
                key="cinema-members-drawer"
                initial={isPortraitDevice ? { opacity: 0, y: 12 } : { width: 0, opacity: 0 }}
                animate={isPortraitDevice ? { opacity: 1, y: 0 } : { width: sidePanelWidth, opacity: 1 }}
                exit={isPortraitDevice ? { opacity: 0, y: 12 } : { width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={
                  isPortraitDevice
                    ? 'flex-1 min-h-0 w-full bg-[#0D0609] overflow-hidden flex flex-col'
                    : 'h-full shrink-0 border-l border-white/12 bg-[#0D0609]/96 overflow-hidden'
                }
              >
                <div
                  className="h-full w-full flex flex-col min-h-0"
                  style={isPortraitDevice ? undefined : { width: `${sidePanelWidth}px` }}
                >
                  <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold font-display text-white">
                        Audience & Seats
                      </h3>
                      <p className="text-[10px] text-[#9E8F8A]">
                        {members.length} of 24 seats occupied · Room {roomCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMembersPanel(false)}
                      aria-label="Close audience panel"
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Quick Switch Seat Button Inside Cinema Hall */}
                  <div className="px-3 py-2 border-b border-white/8 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-[11px] text-[#CFC2BE] flex items-center gap-1.5">
                      <Armchair className="w-3.5 h-3.5 text-[#E5C17B]" />
                      Your Seat: <strong className="font-mono text-[#F3DBA8]">{mySeatId}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={onOpenSeatSelector}
                      className="px-2.5 py-1 rounded-lg bg-[#9E1B32] hover:bg-[#b5203a] text-white text-[10px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Change Seat
                    </button>
                  </div>

                  {/* Cinema Atmosphere Quality Switcher */}
                  <div className="px-3 py-2 border-b border-white/8 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-[11px] text-[#B7A9A4] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#E5C17B]" />
                      Lighting
                    </span>
                    <div className="flex items-center gap-1 bg-black/50 p-0.5 rounded-lg border border-white/10">
                      {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onChangeGraphicsQuality(q)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize cursor-pointer ${
                            graphicsQuality === q
                              ? 'bg-[#9E1B32] text-white'
                              : 'text-[#A89A95] hover:text-white'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto touch-scroll p-2.5 space-y-2">
                    {members.map((member) => {
                      const isMemberHost = member.uid === hostId;
                      const isMe = member.uid === user.uid;
                      return (
                        <div
                          key={member.uid}
                          className="rounded-xl bg-white/[0.04] border border-white/8 p-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar
                              src={member.photoURL}
                              name={member.displayName}
                              size="sm"
                              isHost={isMemberHost}
                              isSpeaking={member.isSpeaking}
                              isOnline={member.isOnline}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">
                                {isMe ? `${member.displayName} (You)` : member.displayName}
                              </p>
                              <p className="text-[10px] text-[#9E8F8A] flex items-center gap-1.5">
                                <span>
                                  Seat <span className="font-mono text-[#E5C17B]">{member.seatId}</span>
                                </span>
                                {member.inVoice && (
                                  <span className={member.micMuted ? 'text-rose-300' : 'text-emerald-300'}>
                                    · {member.micMuted ? 'Muted' : member.isSpeaking ? 'Speaking' : 'Voice'}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          {isHost && !isMe && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => onTransferHost(member)}
                                title="Transfer Host Role"
                                className="w-7 h-7 rounded-lg bg-[#E5C17B]/15 text-[#E5C17B] flex items-center justify-center cursor-pointer"
                              >
                                <Crown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onKickMember(member)}
                                title="Remove from Room"
                                className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-300 flex items-center justify-center cursor-pointer"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* === FOCUS MODE FLOATING EXIT HINT === */}
        <AnimatePresence>
          {focusMode === 'focus' && (controlsVisible || focusHintVisible) && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={toggleFocusMode}
              className="absolute top-3 right-3 z-40 px-3.5 h-8 rounded-full bg-[#12090D]/92 border border-white/18 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#E5C17B]" />
              Exit Focus
            </motion.button>
          )}
        </AnimatePresence>

        {/* === BRIEF DIGITAL PVR ADMISSION TICKET ON ENTERING AUDITORIUM === */}
        <AnimatePresence>
          {showEntranceTicket && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.96 }}
              transition={{ duration: 0.28 }}
              className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40"
            >
              <div className="rounded-2xl bg-[#160A0F]/95 border border-[#E5C17B]/45 px-4 py-2 shadow-2xl flex items-center gap-3">
                <Ticket className="w-4 h-4 text-[#E5C17B] shrink-0" />
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-[#F3DBA8] leading-tight">
                    CineHall YVR · Seat {mySeatId}
                  </p>
                  <p className="text-[10px] text-[#CFC2BE]">
                    {roomName} · {members.length} Seated Live
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
