import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronUp, CornerDownLeft, Delete, Send, Smile, X } from 'lucide-react';

interface CinemaCustomKeyboardProps {
  value: string;
  isOpen: boolean;
  compact?: boolean;
  onChange: (nextValue: string) => void;
  onSend: () => void;
  onToggleOpen: () => void;
}

type KeyboardLayer = 'alpha' | 'symbols' | 'emoji';

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const ALPHA_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

const SYMBOL_ROWS = [
  ['@', '#', '$', '%', '&', '-', '+', '(', ')', '/'],
  ['*', '"', "'", ':', ';', '!', '?', '~', '='],
  ['.', ',', '_', '\\', '[', ']', '<', '>']
];

const EMOJI_GRID = [
  '❤️', '😂', '🔥', '😮', '👏', '🍿', '🎬', '😍',
  '🤣', '😭', '🤯', '🙌', '👌', '💯', '🎉', '✨',
  '😎', '🥳', '😱', '🤩', '🫶', '👍', '💀', '👀'
];

/**
 * CineHall built-in cinema keyboard.
 * Uses an application-managed composer (no native <input> focus) so Android/iOS system keyboards
 * stay closed while this mode is active, while physical desktop keyboards still type seamlessly.
 */
export function CinemaCustomKeyboard({
  value,
  isOpen,
  compact = false,
  onChange,
  onSend,
  onToggleOpen
}: CinemaCustomKeyboardProps) {
  const [layer, setLayer] = useState<KeyboardLayer>('alpha');
  const [shiftMode, setShiftMode] = useState<'off' | 'once' | 'caps'>('off');
  const lastShiftTapRef = useRef<number>(0);
  const backspaceTimerRef = useRef<number | null>(null);
  const backspaceIntervalRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const stopBackspaceRepeat = useCallback(() => {
    if (backspaceTimerRef.current) {
      window.clearTimeout(backspaceTimerRef.current);
      backspaceTimerRef.current = null;
    }
    if (backspaceIntervalRef.current) {
      window.clearInterval(backspaceIntervalRef.current);
      backspaceIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopBackspaceRepeat(), [stopBackspaceRepeat]);

  const appendText = useCallback(
    (token: string) => {
      const current = valueRef.current;
      if (current.length >= 360) return;
      const out = shiftMode !== 'off' && layer === 'alpha' ? token.toUpperCase() : token;
      onChange(current + out);
      if (shiftMode === 'once') {
        setShiftMode('off');
      }
    },
    [layer, onChange, shiftMode]
  );

  const deleteLastChar = useCallback(() => {
    const current = valueRef.current;
    if (!current) return;
    const chars = Array.from(current);
    chars.pop();
    onChange(chars.join(''));
  }, [onChange]);

  const startBackspaceHold = () => {
    deleteLastChar();
    stopBackspaceRepeat();
    backspaceTimerRef.current = window.setTimeout(() => {
      backspaceIntervalRef.current = window.setInterval(() => {
        deleteLastChar();
      }, 65);
    }, 340);
  };

  const handleShiftPress = () => {
    const now = Date.now();
    if (shiftMode === 'once' && now - lastShiftTapRef.current < 360) {
      setShiftMode('caps');
    } else if (shiftMode === 'caps' || shiftMode === 'once') {
      setShiftMode('off');
    } else {
      setShiftMode('once');
    }
    lastShiftTapRef.current = now;
  };

  // Support physical desktop keyboards seamlessly while App keyboard mode is active
  useEffect(() => {
    if (!isOpen) return;
    const handlePhysicalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onSend();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        deleteLastChar();
      } else if (e.key.length === 1) {
        e.preventDefault();
        const cur = valueRef.current;
        if (cur.length < 360) onChange(cur + e.key);
      }
    };
    window.addEventListener('keydown', handlePhysicalKeyDown);
    return () => window.removeEventListener('keydown', handlePhysicalKeyDown);
  }, [isOpen, deleteLastChar, onChange, onSend]);

  const keyHeight = compact ? 'h-[26px]' : 'h-[30px]';
  const keyBase = `${keyHeight} rounded-[6px] bg-[#1E1318] border border-white/[0.09] active:bg-[#9E1B32] active:border-[#E5C17B]/60 text-[#F5EFEA] font-medium text-[11px] flex items-center justify-center select-none touch-manipulation transition-colors cursor-pointer`;
  const modKeyBase = `${keyHeight} rounded-[6px] bg-[#29171F] border border-white/[0.11] active:bg-[#9E1B32] text-[#E5C17B] font-semibold text-[10px] flex items-center justify-center select-none touch-manipulation transition-colors cursor-pointer`;

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#10070B] select-none">
      {/* Application-Managed Composer Bar (NEVER Triggers System Keyboard) */}
      <div className="px-2 py-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={isOpen ? 'Collapse app keyboard' : 'Expand app keyboard'}
          className="w-7 h-8 rounded-lg bg-white/[0.06] hover:bg-white/10 text-[#CFC2BE] flex items-center justify-center shrink-0 cursor-pointer"
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        <div
          role="textbox"
          aria-label="Cinema chat message composer"
          onClick={() => {
            if (!isOpen) onToggleOpen();
          }}
          className="flex-1 min-w-0 h-8 rounded-full bg-black/55 border border-[#E5C17B]/35 px-3 flex items-center justify-between gap-1.5 cursor-text overflow-hidden"
        >
          <div className="flex-1 min-w-0 flex items-center overflow-x-auto no-scrollbar whitespace-nowrap text-xs">
            {value ? (
              <span className="text-white">{value}</span>
            ) : (
              <span className="text-[#8E7F7A]">Type with CineHall keyboard...</span>
            )}
            {isOpen && <span className="inline-block w-[1.5px] h-3.5 bg-[#E5C17B] ml-0.5 shrink-0" />}
          </div>
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              aria-label="Clear message"
              className="text-[#9E8F8A] hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="Send message"
          className="w-8 h-8 rounded-full cinema-cta-gradient text-white flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-95 transition-transform cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Built-in Dark Burgundy & Champagne-Gold Keyboard */}
      {isOpen && (
        <div className="px-1.5 pb-1.5 pt-1 bg-[#0A0407] border-t border-white/[0.07] space-y-1">
          {layer === 'emoji' ? (
            <div className="space-y-1">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_GRID.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => appendText(em)}
                    className={`${keyHeight} rounded-[6px] bg-[#190F14] border border-white/[0.07] active:bg-[#9E1B32]/60 text-sm flex items-center justify-center cursor-pointer touch-manipulation`}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLayer('alpha')}
                  className={`${modKeyBase} px-2.5 flex-1`}
                >
                  ABC
                </button>
                <button
                  type="button"
                  onPointerDown={startBackspaceHold}
                  onPointerUp={stopBackspaceRepeat}
                  onPointerLeave={stopBackspaceRepeat}
                  onPointerCancel={stopBackspaceRepeat}
                  aria-label="Backspace"
                  className={`${modKeyBase} w-12`}
                >
                  <Delete className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!value.trim()}
                  className={`${keyHeight} px-3.5 rounded-[6px] cinema-cta-gradient text-white text-[11px] font-semibold disabled:opacity-40 flex items-center gap-1 cursor-pointer`}
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Compact Number Row */}
              <div className="grid grid-cols-10 gap-[3px]">
                {NUMBER_ROW.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => appendText(num)}
                    className={`${compact ? 'h-[22px]' : 'h-[24px]'} rounded-[5px] bg-[#160D12] border border-white/[0.07] active:bg-[#9E1B32] text-[#D8CCC8] text-[10px] font-mono flex items-center justify-center cursor-pointer touch-manipulation`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Row 1 */}
              <div className="grid grid-cols-10 gap-[3px]">
                {(layer === 'alpha' ? ALPHA_ROWS[0] : SYMBOL_ROWS[0]).map((k) => {
                  const display = layer === 'alpha' && shiftMode !== 'off' ? k.toUpperCase() : k;
                  return (
                    <button key={k} type="button" onClick={() => appendText(k)} className={keyBase}>
                      {display}
                    </button>
                  );
                })}
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-9 gap-[3px] px-1.5">
                {(layer === 'alpha' ? ALPHA_ROWS[1] : SYMBOL_ROWS[1]).map((k) => {
                  const display = layer === 'alpha' && shiftMode !== 'off' ? k.toUpperCase() : k;
                  return (
                    <button key={k} type="button" onClick={() => appendText(k)} className={keyBase}>
                      {display}
                    </button>
                  );
                })}
              </div>

              {/* Row 3 (Shift + Letters + Backspace) */}
              <div className="flex items-center gap-[3px]">
                <button
                  type="button"
                  onClick={handleShiftPress}
                  aria-label="Shift or Caps Lock"
                  className={`${modKeyBase} w-9 shrink-0 ${
                    shiftMode === 'caps'
                      ? 'bg-[#9E1B32] border-[#E5C17B] text-white'
                      : shiftMode === 'once'
                        ? 'bg-[#4D1422] border-[#E5C17B]/60 text-[#F3DBA8]'
                        : ''
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>

                <div
                  className={`flex-1 grid gap-[3px] ${
                    layer === 'alpha' ? 'grid-cols-7' : 'grid-cols-8'
                  }`}
                >
                  {(layer === 'alpha' ? ALPHA_ROWS[2] : SYMBOL_ROWS[2]).map((k) => {
                    const display = layer === 'alpha' && shiftMode !== 'off' ? k.toUpperCase() : k;
                    return (
                      <button key={k} type="button" onClick={() => appendText(k)} className={keyBase}>
                        {display}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onPointerDown={startBackspaceHold}
                  onPointerUp={stopBackspaceRepeat}
                  onPointerLeave={stopBackspaceRepeat}
                  onPointerCancel={stopBackspaceRepeat}
                  aria-label="Backspace"
                  className={`${modKeyBase} w-10 shrink-0`}
                >
                  <Delete className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Row 4 (123 / Emoji / Spacebar / Period / Send) */}
              <div className="flex items-center gap-[3px]">
                <button
                  type="button"
                  onClick={() => setLayer((l) => (l === 'alpha' ? 'symbols' : 'alpha'))}
                  className={`${modKeyBase} w-10 shrink-0`}
                >
                  {layer === 'alpha' ? '123' : 'ABC'}
                </button>

                <button
                  type="button"
                  onClick={() => setLayer('emoji')}
                  aria-label="Open emojis"
                  className={`${modKeyBase} w-8 shrink-0`}
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => appendText(' ')}
                  className={`${keyBase} flex-1 text-[10px] text-[#B7A9A4] tracking-wide`}
                >
                  space
                </button>

                <button
                  type="button"
                  onClick={() => appendText('.')}
                  className={`${keyBase} w-7 shrink-0`}
                >
                  .
                </button>

                <button
                  type="button"
                  onClick={onSend}
                  disabled={!value.trim()}
                  aria-label="Send chat message"
                  className={`${keyHeight} w-11 shrink-0 rounded-[6px] cinema-cta-gradient text-white flex items-center justify-center disabled:opacity-40 cursor-pointer touch-manipulation`}
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
