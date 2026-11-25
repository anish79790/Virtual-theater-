import { motion, AnimatePresence } from 'motion/react';
import { Crown, X, Check } from 'lucide-react';
import { AUDITORIUM_SEATS, type LiveMember, type SeatDefinition } from '../types/cinema';
import { Avatar } from './Avatar';

interface SeatSelectorModalProps {
  open: boolean;
  onClose: () => void;
  members: LiveMember[];
  currentUid: string;
  hostId: string;
  selectedSeatId: string;
  onSelectSeat: (seatId: string) => void;
}

function CinemaSeatGlyph({
  tier,
  state
}: {
  tier: SeatDefinition['tier'];
  state: 'available' | 'selected' | 'occupied' | 'host';
}) {
  const fill =
    state === 'selected'
      ? '#C8233F'
      : state === 'host'
        ? '#8B6926'
        : state === 'occupied'
          ? '#4D121F'
          : tier === 'recliner'
            ? '#25171B'
            : '#1B1114';

  const stroke =
    state === 'selected'
      ? '#F3DBA8'
      : state === 'host'
        ? '#E5C17B'
        : state === 'occupied'
          ? '#9E1B32'
          : tier === 'recliner'
            ? 'rgba(229,193,123,0.35)'
            : 'rgba(255,255,255,0.16)';

  return (
    <svg viewBox="0 0 44 40" className="w-full h-full overflow-visible" aria-hidden="true">
      {/* Plush backrest */}
      <rect
        x="7"
        y="3"
        width="30"
        height={tier === 'recliner' ? '22' : '20'}
        rx={tier === 'recliner' ? '8' : '6'}
        fill={fill}
        stroke={stroke}
        strokeWidth="1.6"
      />
      {/* Cushion headrest stitch */}
      <path d="M13 10 H31" stroke={stroke} strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
      {/* Seat base */}
      <rect x="6" y="21" width="32" height="12" rx="4" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {/* Left & right velvet armrests */}
      <rect x="2" y="16" width="5" height="16" rx="2.5" fill={fill} stroke={stroke} strokeWidth="1.3" />
      <rect x="37" y="16" width="5" height="16" rx="2.5" fill={fill} stroke={stroke} strokeWidth="1.3" />
      {tier === 'recliner' && (
        <rect x="10" y="34" width="24" height="3.5" rx="1.75" fill="#E5C17B" fillOpacity="0.45" />
      )}
    </svg>
  );
}

export function SeatSelectorModal({
  open,
  onClose,
  members,
  currentUid,
  hostId,
  selectedSeatId,
  onSelectSeat
}: SeatSelectorModalProps) {
  const occupiedBySeat = new Map<string, LiveMember>();
  members.forEach((m) => {
    if (m.seatId) occupiedBySeat.set(m.seatId, m);
  });

  const rows: { id: 'A' | 'B' | 'C'; title: string; subtitle: string }[] = [
    { id: 'A', title: 'Row A · Classic', subtitle: 'Front immersive view' },
    { id: 'B', title: 'Row B · Prime', subtitle: 'Balanced acoustics & center sightline' },
    { id: 'C', title: 'Row C · Gold Recliners', subtitle: 'Luxury wide velvet loungers' }
  ];

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
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto touch-scroll rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold font-display text-[#F5EFEA]">Select Your YVR Seat</h2>
                <p className="text-xs text-[#9E8F8A]">Current seat: <span className="text-[#E5C17B] font-mono font-medium">{selectedSeatId}</span></p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close seat selection"
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Curved PVR Screen Arc */}
            <div className="pt-1 pb-2">
              <div className="relative h-9 flex flex-col items-center justify-end">
                <div
                  className="w-[88%] h-3 rounded-t-[100%] border-t-2 border-[#E5C17B]/75"
                  style={{
                    boxShadow: '0 -10px 26px rgba(229, 193, 123, 0.22)'
                  }}
                />
                <span className="text-[11px] tracking-[0.22em] text-[#9E8F8A] mt-1 font-medium">SCREEN THIS WAY</span>
              </div>
            </div>

            {/* Rows */}
            <div className="space-y-5">
              {rows.map((row) => {
                const seats = AUDITORIUM_SEATS.filter((s) => s.row === row.id);
                return (
                  <div key={row.id} className="space-y-2.5">
                    <div className="flex items-baseline justify-between text-xs px-1">
                      <span className="font-medium text-[#E5C17B]">{row.title}</span>
                      <span className="text-[#857671]">{row.subtitle}</span>
                    </div>
                    <div className="grid grid-cols-8 gap-1.5 sm:gap-2.5 items-center">
                      {seats.map((seat, idx) => {
                        const occupant = occupiedBySeat.get(seat.id);
                        const isMine = occupant?.uid === currentUid || selectedSeatId === seat.id;
                        const isHostSeat = occupant?.uid === hostId;
                        const isOccupiedByOther = Boolean(occupant && occupant.uid !== currentUid);

                        const glyphState = isMine
                          ? 'selected'
                          : isHostSeat
                            ? 'host'
                            : isOccupiedByOther
                              ? 'occupied'
                              : 'available';

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            disabled={isOccupiedByOther}
                            onClick={() => onSelectSeat(seat.id)}
                            title={
                              isOccupiedByOther
                                ? `${seat.id} · Taken by ${occupant?.displayName}`
                                : `${seat.id} (${seat.label})`
                            }
                            className={`relative flex flex-col items-center gap-1 p-1 rounded-xl transition-transform active:scale-95 ${
                              idx === 3 ? 'mr-1.5 sm:mr-2.5' : ''
                            } ${
                              isOccupiedByOther
                                ? 'opacity-90 cursor-not-allowed'
                                : 'cursor-pointer hover:bg-white/5'
                            }`}
                          >
                            <div className="relative w-9 h-8 sm:w-11 sm:h-10">
                              <CinemaSeatGlyph tier={seat.tier} state={glyphState} />
                              {occupant && (
                                <div className="absolute inset-0 flex items-center justify-center -mt-1">
                                  <Avatar
                                    src={occupant.photoURL}
                                    name={occupant.displayName}
                                    size="xs"
                                    isHost={isHostSeat}
                                  />
                                </div>
                              )}
                              {!occupant && isMine && (
                                <div className="absolute inset-0 flex items-center justify-center -mt-1 text-[#F3DBA8]">
                                  <Check className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>
                            <span
                              className={`text-[10px] font-mono tabular-nums ${
                                isMine ? 'text-[#F3DBA8] font-semibold' : 'text-[#8F807B]'
                              }`}
                            >
                              {seat.id}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/8 text-xs text-[#A99B96]">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#1B1114] border border-white/20" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#C8233F] border border-[#F3DBA8]" />
                  Your Seat
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#4D121F] border border-[#9E1B32]" />
                  Occupied
                </span>
                <span className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-[#E5C17B]" />
                  Host
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl cinema-cta-gradient text-white text-xs font-medium cursor-pointer"
              >
                Confirm Seat
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
