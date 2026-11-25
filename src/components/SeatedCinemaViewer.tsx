import { motion, AnimatePresence } from 'motion/react';
import { Crown, Mic } from 'lucide-react';
import type { GraphicsQuality, LiveMember } from '../types/cinema';

/** Deterministic hash from user UID for consistent realistic hair/clothing/silhouette variation */
function hashUid(uid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const HAIR_COLORS = ['#0D0A0C', '#1A1210', '#241814', '#16141A', '#2B1D16', '#100E12'];
const JACKET_COLORS = [
  ['#1E222B', '#11131A'],
  ['#2A1A22', '#170D12'],
  ['#1A2624', '#0F1615'],
  ['#231F2D', '#13101A'],
  ['#29221C', '#16120E'],
  ['#1D2530', '#10151C']
];

export interface SeatedCinemaViewerProps {
  member: LiveMember;
  isHost: boolean;
  isMe: boolean;
  isPlaying: boolean;
  focusMode: boolean;
  graphicsQuality: GraphicsQuality;
  leftPct: number;
  topPct: number;
  scale: number;
  zIndex: number;
  activeReactionEmoji?: string | null;
}

/**
 * Renders a realistic, theater-lit back-view human silhouette seated physically inside a crimson velvet PVR chair.
 * Strictly driven by real connected Socket.IO room members — zero fake/mocked audience members.
 */
export function SeatedCinemaViewer({
  member,
  isHost,
  isMe,
  isPlaying,
  focusMode,
  graphicsQuality,
  leftPct,
  topPct,
  scale,
  zIndex,
  activeReactionEmoji
}: SeatedCinemaViewerProps) {
  const h = hashUid(member.uid);
  const hairVariant = h % 6; // 0: short fade, 1: wavy medium, 2: high bun, 3: curly volume, 4: shoulder length, 5: textured crop
  const hairColor = HAIR_COLORS[h % HAIR_COLORS.length];
  const [jacketTop, jacketBottom] = JACKET_COLORS[(h >> 3) % JACKET_COLORS.length];
  const isHoodie = (h >> 5) % 2 === 0;
  const swayDelay = (h % 20) * 0.22;
  const firstName = member.displayName.trim().split(' ')[0].slice(0, 11) || 'Guest';

  const gradId = `viewer-${member.uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
  const rimOpacity = isPlaying ? 0.58 : 0.34;
  const animateMotion = graphicsQuality !== 'low';

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        zIndex,
        width: `${8.6 * scale}%`,
        aspectRatio: '1 / 1.05',
        transform: 'translate(-50%, -78%)'
      }}
    >
      {/* Floating Emoji Reaction Rising Directly Above This Friend's Cinema Seat */}
      <AnimatePresence>
        {activeReactionEmoji && (
          <motion.div
            key={`${member.uid}-${activeReactionEmoji}`}
            initial={{ opacity: 0, y: 8, scale: 0.55 }}
            animate={{ opacity: [0, 1, 1, 0], y: -44, scale: [0.7, 1.15, 1.05, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.1, ease: 'easeOut' }}
            className="absolute left-1/2 -translate-x-1/2 -top-6 text-lg sm:text-2xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]"
          >
            {activeReactionEmoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle Non-Distracting Seat Nameplate (Dims Gently During Movie Playback) */}
      {!focusMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-4 sm:-top-5 whitespace-nowrap transition-opacity duration-500"
          style={{
            opacity: member.isSpeaking ? 0.96 : isPlaying ? 0.36 : 0.84
          }}
        >
          <div
            className={`px-1.5 py-[1px] rounded-full flex items-center gap-1 text-[8px] sm:text-[9px] font-medium tracking-tight border shadow-md ${
              member.isSpeaking
                ? 'bg-emerald-950/90 border-emerald-400/70 text-emerald-200'
                : isMe
                  ? 'bg-[#2A1019]/90 border-[#E5C17B]/65 text-[#F3DBA8]'
                  : 'bg-[#0C0609]/85 border-white/15 text-[#EDE4DF]'
            }`}
          >
            {isHost && <Crown className="w-2.5 h-2.5 text-[#E5C17B] shrink-0" />}
            {member.isSpeaking && <Mic className="w-2.5 h-2.5 text-emerald-300 shrink-0" />}
            <span>{isMe ? `${firstName} (You)` : firstName}</span>
            <span className="font-mono text-[7px] sm:text-[8px] text-[#E5C17B]/85">{member.seatId}</span>
          </div>
        </div>
      )}

      {/* Grounded Contact Occlusion Shadow On The Red Velvet Chair Backrest */}
      <div
        className="absolute inset-x-[12%] bottom-[2%] h-[34%] rounded-full"
        style={{
          background: 'radial-gradient(ellipse at 50% 60%, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.38) 55%, transparent 100%)',
          filter: 'blur(3px)'
        }}
      />

      {/* Realistic Theater-Lit Back-View Human Figure Nestled Into The Seat */}
      <motion.div
        animate={
          animateMotion
            ? {
                y: activeReactionEmoji ? [0, -4, 0] : [0, -1.2, 0],
                rotate: [0, (h % 2 === 0 ? 1 : -1) * 1.1, 0]
              }
            : undefined
        }
        transition={
          activeReactionEmoji
            ? { duration: 0.45, ease: 'easeOut' }
            : { duration: 4.2 + (h % 3) * 0.6, repeat: Infinity, ease: 'easeInOut', delay: swayDelay }
        }
        className="w-full h-full relative"
        style={{
          // Smoothly tucks the lower torso INTO the red velvet chair backrest so the viewer is physically seated
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 66%, rgba(0,0,0,0.55) 84%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 66%, rgba(0,0,0,0.55) 84%, transparent 100%)',
          filter: member.isSpeaking
            ? 'drop-shadow(0 -2px 7px rgba(52, 211, 153, 0.55))'
            : isPlaying
              ? 'drop-shadow(0 -1px 4px rgba(170, 200, 255, 0.22))'
              : 'drop-shadow(0 -1px 3px rgba(245, 200, 130, 0.16))'
        }}
      >
        <svg viewBox="0 0 120 126" className="w-full h-full overflow-visible" aria-hidden="true">
          <defs>
            {/* Torso / Jacket dark theater shading */}
            <linearGradient id={`${gradId}-torso`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={jacketTop} />
              <stop offset="55%" stopColor={jacketBottom} />
              <stop offset="100%" stopColor="#090507" />
            </linearGradient>

            {/* Cinema screen rim light illuminating the top contour of head & shoulders */}
            <linearGradient id={`${gradId}-rim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPlaying ? '#C5DCFF' : '#F3CF95'} stopOpacity={rimOpacity} />
              <stop offset="45%" stopColor={isPlaying ? '#8CB4F5' : '#D9A760'} stopOpacity={rimOpacity * 0.35} />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </linearGradient>

            {/* Hair depth gradient */}
            <radialGradient id={`${gradId}-hair`} cx="50%" cy="22%" r="72%">
              <stop offset="0%" stopColor="#2E262B" stopOpacity="0.65" />
              <stop offset="45%" stopColor={hairColor} />
              <stop offset="100%" stopColor="#070507" />
            </radialGradient>
          </defs>

          {/* Natural Sloped Shoulders & Relaxed Back Torso */}
          <path
            d="M14 122 C14 96, 22 80, 38 74 C45 71.5, 51 69, 60 69 C69 69, 75 71.5, 82 74 C98 80, 106 96, 106 122 Z"
            fill={`url(#${gradId}-torso)`}
          />

          {/* Subtle Shoulder Rim Highlight From Giant Cinema Screen */}
          <path
            d="M20 92 C25 80, 36 74, 48 71.5 C53 70.5, 67 70.5, 72 71.5 C84 74, 95 80, 100 92"
            fill="none"
            stroke={`url(#${gradId}-rim)`}
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Hoodie Fold or Jacket Collar Detail on Back */}
          {isHoodie ? (
            <path
              d="M42 73 C46 84, 52 88, 60 88 C68 88, 74 84, 78 73 C73 76, 66 78, 60 78 C54 78, 47 76, 42 73 Z"
              fill="#0E0B0F"
              opacity="0.72"
            />
          ) : (
            <path
              d="M46 71 C51 75, 55 76, 60 76 C65 76, 69 75, 74 71"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}

          {/* Subtle Neck Silhouette */}
          <path d="M51 60 L51 73 C54 75, 66 75, 69 73 L69 60 Z" fill="#181214" />

          {/* Subtle Ears (Visible From Behind In Real Cinema View) */}
          <ellipse cx="40.5" cy="43" rx="3.2" ry="5.5" fill="#1E1516" />
          <ellipse cx="79.5" cy="43" rx="3.2" ry="5.5" fill="#1E1516" />

          {/* Back of Head & Natural Hair Silhouettes */}
          {hairVariant === 2 && (
            /* High Bun / Ponytail Style */
            <ellipse cx="60" cy="14" rx="10.5" ry="9" fill={`url(#${gradId}-hair)`} />
          )}

          {hairVariant === 4 && (
            /* Shoulder-Length Straight / Soft Hair Flowing Over Collar */
            <path
              d="M39 42 C37 56, 36 72, 41 80 C48 83, 72 83, 79 80 C84 72, 83 56, 81 42 Z"
              fill={`url(#${gradId}-hair)`}
            />
          )}

          {hairVariant === 1 && (
            /* Medium Wavy Back Hair */
            <path
              d="M40 43 C38 54, 41 64, 47 68 C54 71, 66 71, 73 68 C79 64, 82 54, 80 43 Z"
              fill={`url(#${gradId}-hair)`}
            />
          )}

          {hairVariant === 3 && (
            /* Full Curly Volume */
            <path
              d="M36 42 C33 27, 42 15, 60 15 C78 15, 87 27, 84 42 C83 52, 76 61, 60 62 C44 61, 37 52, 36 42 Z"
              fill={`url(#${gradId}-hair)`}
            />
          )}

          {/* Core Cranium / Back of Head */}
          <ellipse
            cx="60"
            cy="41"
            rx={hairVariant === 3 ? 21.5 : 19.5}
            ry={hairVariant === 5 ? 22.5 : 21.5}
            fill={`url(#${gradId}-hair)`}
          />

          {/* Tapered Nape Shadow for Short Hair Styles */}
          {(hairVariant === 0 || hairVariant === 5) && (
            <path
              d="M45 53 C49 60, 54 63, 60 63 C66 63, 71 60, 75 53 C70 57, 65 58, 60 58 C55 58, 50 57, 45 53 Z"
              fill="#191315"
              opacity="0.7"
            />
          )}

          {/* Soft Cinema Screen Rim Light Tracing Crown of Head */}
          <path
            d="M42 35 C44 23, 51 19.5, 60 19.5 C69 19.5, 76 23, 78 35"
            fill="none"
            stroke={`url(#${gradId}-rim)`}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
    </div>
  );
}
