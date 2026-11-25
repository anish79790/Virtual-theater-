import { useState } from 'react';
import { Crown } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isHost?: boolean;
  isSpeaking?: boolean;
  isOnline?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base'
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ src, name, size = 'md', isHost = false, isSpeaking = false, isOnline = false, className = '' }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const ringClass = isSpeaking
    ? 'ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]'
    : isHost
      ? 'ring-2 ring-[#E5C17B]'
      : 'ring-1 ring-white/15';

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${SIZE_CLASSES[size]} ${ringClass} rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#6E1225] to-[#26090F] text-[#F5EFEA] font-semibold select-none transition-shadow duration-200`}
      >
        {src && !imgFailed ? (
          <img
            src={src}
            alt={name}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      {isHost && (
        <span
          title="Cinema Host"
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#1C120A] border border-[#E5C17B] flex items-center justify-center text-[#E5C17B] shadow-md"
        >
          <Crown className="w-2.5 h-2.5 fill-[#E5C17B]" />
        </span>
      )}

      {isOnline && (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0E090B]"
        />
      )}
    </div>
  );
}
