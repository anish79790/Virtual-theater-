import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SeatedCinemaViewer } from './SeatedCinemaViewer';
import type { CinemaFocusMode, FloatingReaction, GraphicsQuality, LiveMember } from '../types/cinema';

/**
 * Exact pixel-measured geometry of /src/assets/images/cinehall_pvr_auditorium_wide_1795608084967.jpg (1376x768)
 * so the live YouTube/Browser video locks 100.0% flush into the physical cinema screen proscenium on every device.
 */
const HALL_IMAGE_URL = '/src/assets/images/cinehall_pvr_auditorium_wide_1795608084967.jpg';
const HALL_ASPECT = 1376 / 768;

// Exact matte-black cinema projection screen bounding box inside the hall photograph (normalized 0..1)
const SCREEN_RECT = {
  left: 0.2735,
  top: 0.159,
  width: 0.453,
  height: 0.435,
  centerX: 0.5,
  centerY: 0.3765
};

interface SeatAnchor {
  id: string;
  leftPct: number;
  topPct: number;
  scale: number;
  zIndex: number;
}

/**
 * Maps all 24 interactive cinema room seats (A1-A8, B1-B8, C1-C8) directly onto the real crimson velvet
 * cinema recliner chairs visible in the photorealistic PVR auditorium photograph.
 */
const SEAT_ANCHORS: Record<string, SeatAnchor> = {
  // Row A: Front stadium row closest to the giant cinema screen (8 seats across left, center & right sections)
  A1: { id: 'A1', leftPct: 19.8, topPct: 71.2, scale: 0.56, zIndex: 22 },
  A2: { id: 'A2', leftPct: 26.0, topPct: 71.0, scale: 0.58, zIndex: 22 },
  A3: { id: 'A3', leftPct: 37.6, topPct: 70.8, scale: 0.6, zIndex: 22 },
  A4: { id: 'A4', leftPct: 44.2, topPct: 70.7, scale: 0.61, zIndex: 22 },
  A5: { id: 'A5', leftPct: 55.8, topPct: 70.7, scale: 0.61, zIndex: 22 },
  A6: { id: 'A6', leftPct: 62.4, topPct: 70.8, scale: 0.6, zIndex: 22 },
  A7: { id: 'A7', leftPct: 74.0, topPct: 71.0, scale: 0.58, zIndex: 22 },
  A8: { id: 'A8', leftPct: 80.2, topPct: 71.2, scale: 0.56, zIndex: 22 },

  // Row B: Prime center stadium row (8 plush velvet recliners)
  B1: { id: 'B1', leftPct: 14.5, topPct: 76.2, scale: 0.72, zIndex: 25 },
  B2: { id: 'B2', leftPct: 22.8, topPct: 76.4, scale: 0.74, zIndex: 25 },
  B3: { id: 'B3', leftPct: 34.4, topPct: 76.8, scale: 0.76, zIndex: 25 },
  B4: { id: 'B4', leftPct: 42.6, topPct: 77.0, scale: 0.78, zIndex: 25 },
  B5: { id: 'B5', leftPct: 57.4, topPct: 77.0, scale: 0.78, zIndex: 25 },
  B6: { id: 'B6', leftPct: 65.6, topPct: 76.8, scale: 0.76, zIndex: 25 },
  B7: { id: 'B7', leftPct: 77.2, topPct: 76.4, scale: 0.74, zIndex: 25 },
  B8: { id: 'B8', leftPct: 85.5, topPct: 76.2, scale: 0.72, zIndex: 25 },

  // Row C: Closest foreground luxury recliners with warm backlit gold cup holders
  C1: { id: 'C1', leftPct: 11.2, topPct: 83.4, scale: 0.9, zIndex: 28 },
  C2: { id: 'C2', leftPct: 20.6, topPct: 83.8, scale: 0.92, zIndex: 28 },
  C3: { id: 'C3', leftPct: 31.8, topPct: 84.2, scale: 0.96, zIndex: 28 },
  C4: { id: 'C4', leftPct: 42.4, topPct: 84.4, scale: 0.98, zIndex: 28 },
  C5: { id: 'C5', leftPct: 57.6, topPct: 84.4, scale: 0.98, zIndex: 28 },
  C6: { id: 'C6', leftPct: 68.2, topPct: 84.2, scale: 0.96, zIndex: 28 },
  C7: { id: 'C7', leftPct: 79.4, topPct: 83.8, scale: 0.92, zIndex: 28 },
  C8: { id: 'C8', leftPct: 88.8, topPct: 83.4, scale: 0.9, zIndex: 28 }
};

const ALL_SEAT_KEYS = Object.keys(SEAT_ANCHORS);

interface AuditoriumCinemaStageProps {
  members: LiveMember[];
  hostId: string;
  currentUserId: string;
  isPlaying: boolean;
  focusMode: CinemaFocusMode;
  hasRightPanel: boolean;
  keyboardOpen: boolean;
  isPortraitDevice: boolean;
  portraitCompact?: boolean;
  floatingReactions: FloatingReaction[];
  graphicsQuality: GraphicsQuality;
  children: ReactNode; // Live YouTubeCinemaPlayer or CinemaBrowserView projected seamlessly onto the cinema screen
}

export function AuditoriumCinemaStage({
  members,
  hostId,
  currentUserId,
  isPlaying,
  focusMode,
  hasRightPanel,
  keyboardOpen,
  isPortraitDevice,
  portraitCompact = false,
  floatingReactions,
  graphicsQuality,
  children
}: AuditoriumCinemaStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 960, height: 540 });
  const [recentSeatReactions, setRecentSeatReactions] = useState<Record<string, { emoji: string; id: string }>>({});
  const seenReactionIdsRef = useRef<Set<string>>(new Set());

  // Measure the live cinema stage container cleanly whenever orientation, chat drawer, or keyboard changes
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track active emoji reactions per real connected user so emojis float above THAT friend's seat
  useEffect(() => {
    const timers: number[] = [];
    for (const rx of floatingReactions) {
      if (seenReactionIdsRef.current.has(rx.id)) continue;
      seenReactionIdsRef.current.add(rx.id);
      setRecentSeatReactions((prev) => ({
        ...prev,
        [rx.senderUid]: { emoji: rx.emoji, id: rx.id }
      }));
      const t = window.setTimeout(() => {
        setRecentSeatReactions((prev) => {
          if (prev[rx.senderUid]?.id !== rx.id) return prev;
          const next = { ...prev };
          delete next[rx.senderUid];
          return next;
        });
      }, 2200);
      timers.push(t);
    }

    if (seenReactionIdsRef.current.size > 120) {
      seenReactionIdsRef.current = new Set(floatingReactions.map((r) => r.id));
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [floatingReactions]);

  // Assign each real connected member to their exact seat anchor (zero fake/mock audience members!)
  const seatedViewers = useMemo(() => {
    const onlineMembers = members.filter((m) => m.isOnline !== false);
    const used = new Set<string>();
    return onlineMembers
      .map((member) => {
        let anchor = SEAT_ANCHORS[member.seatId];
        if (!anchor || used.has(anchor.id)) {
          const freeKey = ALL_SEAT_KEYS.find((k) => !used.has(k));
          if (!freeKey) return null;
          anchor = SEAT_ANCHORS[freeKey];
        }
        used.add(anchor.id);
        return { member, anchor };
      })
      .filter((item): item is { member: LiveMember; anchor: SeatAnchor } => item !== null);
  }, [members]);

  // Compute exact unified hall plane dimensions so the YouTube screen ALWAYS covers 100.0% of the physical cinema screen
  const hallFrame = useMemo(() => {
    const { width: sw, height: sh } = stageSize;

    // Target screen size & vertical center inside the stage container for each viewing mode
    let targetWFrac = 0.75;
    let targetHFrac = 0.72;
    let targetCenterYFrac = 0.435;

    if (focusMode === 'focus') {
      targetWFrac = 0.94;
      targetHFrac = 0.91;
      targetCenterYFrac = 0.5;
    } else if (portraitCompact) {
      // Portrait chat/audience open: fill the top pinned theater box cleanly so the video is NEVER hidden or tiny while typing
      targetWFrac = 0.96;
      targetHFrac = 0.94;
      targetCenterYFrac = 0.5;
    } else if (keyboardOpen) {
      // Landscape native keyboard open: keep the entire YouTube cinema screen crisp & 100% unclipped above the keyboard
      targetWFrac = 0.91;
      targetHFrac = 0.86;
      targetCenterYFrac = 0.48;
    } else if (hasRightPanel) {
      // Side chat/audience panel is open: maximize movie screen visibility while keeping velvet seats visible below
      targetWFrac = 0.88;
      targetHFrac = 0.76;
      targetCenterYFrac = 0.44;
    } else if (isPortraitDevice) {
      targetWFrac = 0.92;
      targetHFrac = 0.64;
      targetCenterYFrac = 0.44;
    }

    const desiredScreenW = sw * targetWFrac;
    const desiredScreenH = sh * targetHFrac;

    // Derive unified hall size from the tighter dimension so the screen never overflows or distorts
    const hallWFromW = desiredScreenW / SCREEN_RECT.width;
    const hallWFromH = (desiredScreenH / SCREEN_RECT.height) * HALL_ASPECT;
    const hallW = Math.min(hallWFromW, hallWFromH);
    const hallH = hallW / HALL_ASPECT;

    const left = sw / 2 - hallW * SCREEN_RECT.centerX;
    const top = sh * targetCenterYFrac - hallH * SCREEN_RECT.centerY;

    return { width: hallW, height: hallH, left, top };
  }, [stageSize, focusMode, hasRightPanel, keyboardOpen, isPortraitDevice, portraitCompact]);

  // Dynamic theater house lighting (dims authentically when movie plays, rises warmly on pause)
  const houseDimOpacity = focusMode === 'focus' ? 0.68 : isPlaying ? 0.44 : 0.14;
  const showAtmosphere = graphicsQuality !== 'low';

  return (
    <div
      ref={stageRef}
      className="relative w-full h-full overflow-hidden bg-[#060405] select-none"
    >
      {/* Subtle seamless dark acoustic side-wall ambiance extending naturally to ultra-wide mobile edges */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 80% at 50% 42%, rgba(26, 15, 19, 0.55) 0%, rgba(7, 4, 6, 0.96) 72%, #040203 100%)'
        }}
      />

      {/* === UNIFIED PERSPECTIVE PVR CINEMA HALL PLANE (Hall Photo + Live Video Screen + Seated Friends Locked 1:1) === */}
      <div
        className="absolute will-change-transform transition-[width,height,left,top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `${hallFrame.width}px`,
          height: `${hallFrame.height}px`,
          left: `${hallFrame.left}px`,
          top: `${hallFrame.top}px`
        }}
      >
        {/* 1. Photorealistic Luxury PVR Multiplex Auditorium Photograph */}
        <img
          src={HALL_IMAGE_URL}
          alt="CineHall luxury PVR multiplex auditorium"
          draggable={false}
          className="w-full h-full object-fill pointer-events-none select-none"
          style={{
            // Ultra-soft left/right feathering so ultra-wide 21:9 phones blend seamlessly into the dark theater walls
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0%, black 3.5%, black 96.5%, transparent 100%)',
            maskImage:
              'linear-gradient(90deg, transparent 0%, black 3.5%, black 96.5%, transparent 100%)'
          }}
        />

        {/* 2. Dynamic Theater House Lights Dimmer (Dims walls, ceiling & seats when playing; brightens warmly on pause) */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            background: '#050305',
            opacity: houseDimOpacity
          }}
        />

        {/* 3. Living Screen-Bounce Ambient Glow Casting Soft Light Onto Curtains, Ceiling & Velvet Chair Tops */}
        {showAtmosphere && (
          <div
            className="pointer-events-none absolute transition-opacity duration-700"
            style={{
              left: `${(SCREEN_RECT.left - 0.14) * 100}%`,
              top: `${(SCREEN_RECT.top - 0.1) * 100}%`,
              width: `${(SCREEN_RECT.width + 0.28) * 100}%`,
              height: `${(SCREEN_RECT.height + 0.34) * 100}%`,
              opacity: isPlaying ? 0.68 : 0.25,
              background: isPlaying
                ? 'radial-gradient(ellipse 68% 58% at 50% 42%, rgba(152, 188, 255, 0.28) 0%, rgba(196, 148, 128, 0.11) 48%, transparent 76%)'
                : 'radial-gradient(ellipse 64% 52% at 50% 42%, rgba(229, 193, 123, 0.2) 0%, transparent 72%)'
            }}
          />
        )}

        {/* 4. REAL PROJECTION CINEMA SCREEN — Locked Pixel-For-Pixel Over The Physical Matte-Black Proscenium Opening */}
        <div
          className="absolute z-10 overflow-hidden bg-black"
          style={{
            left: `${SCREEN_RECT.left * 100}%`,
            top: `${SCREEN_RECT.top * 100}%`,
            width: `${SCREEN_RECT.width * 100}%`,
            height: `${SCREEN_RECT.height * 100}%`,
            boxShadow: isPlaying
              ? '0 0 42px rgba(135, 175, 255, 0.22), 0 18px 46px rgba(0, 0, 0, 0.85)'
              : '0 0 24px rgba(229, 193, 123, 0.14), 0 16px 40px rgba(0, 0, 0, 0.85)'
          }}
        >
          {/* Live YouTube IFrame Player or Built-in Cinema Web Browser */}
          <div className="w-full h-full relative">{children}</div>

          {/* Recessed Acoustic Velvet Proscenium Inner Masking Shadow (Makes Video Physically Recessed Into Theater Wall) */}
          <div
            className="pointer-events-none absolute inset-0 z-30"
            style={{
              boxShadow: 'inset 0 0 14px rgba(0, 0, 0, 0.82), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            }}
          />
        </div>

        {/* 5. Subtle Volumetric Projector Beam Descending From Rear Booth Toward The Screen (High Graphics) */}
        {graphicsQuality === 'high' && isPlaying && (
          <div
            className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-700"
            style={{
              background:
                'conic-gradient(from 180deg at 50% -18%, transparent 152deg, rgba(190, 214, 255, 0.045) 172deg, rgba(255, 240, 215, 0.055) 180deg, rgba(190, 214, 255, 0.045) 188deg, transparent 208deg)',
              mixBlendMode: 'screen'
            }}
          />
        )}

        {/* 6. REAL CONNECTED FRIENDS PHYSICALLY SEATED IN THEIR ASSIGNED RED VELVET PVR CHAIRS (ZERO FAKE AUDIENCE!) */}
        {!keyboardOpen && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {seatedViewers.map(({ member, anchor }) => (
              <SeatedCinemaViewer
                key={member.uid}
                member={member}
                isHost={member.uid === hostId}
                isMe={member.uid === currentUserId}
                isPlaying={isPlaying}
                focusMode={focusMode === 'focus'}
                graphicsQuality={graphicsQuality}
                leftPct={anchor.leftPct}
                topPct={anchor.topPct}
                scale={anchor.scale}
                zIndex={anchor.zIndex}
                activeReactionEmoji={recentSeatReactions[member.uid]?.emoji || null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Subtle Edge Cinema Vignette Framing The Audience Perspective */}
      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            'radial-gradient(ellipse 92% 86% at 50% 44%, transparent 56%, rgba(3, 1, 2, 0.58) 100%)'
        }}
      />
    </div>
  );
}
