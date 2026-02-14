interface Props { stage: number; }

/** Explore subagent — a quick, darting squirrel searching the codebase */
export function Squirrel({ stage }: Props) {
  return (
    <g>
      {/* Body (small, upright) */}
      <ellipse cx="0" cy="4" rx="7" ry="9" fill="#8B6B4A" />
      {/* Belly */}
      <ellipse cx="0" cy="6" rx="5" ry="6" fill="#C4A882" />
      {/* Head */}
      <circle cx="0" cy="-10" r="7" fill="#8B6B4A" />
      {/* Cheeks */}
      <ellipse cx="-4" cy="-6" rx="3" ry="2" fill="#C4A882" />
      <ellipse cx="4" cy="-6" rx="3" ry="2" fill="#C4A882" />
      {/* Eyes */}
      <rect x="-4" y="-11" width="3" height="3" fill="#1a1a2e" />
      <rect x="2" y="-11" width="3" height="3" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-3" y="-10" width="1" height="1" fill="#26C6DA" />
      <rect x="3" y="-10" width="1" height="1" fill="#26C6DA" />
      {/* Nose */}
      <rect x="-1" y="-6" width="2" height="2" fill="#5a3a1a" rx="1" />
      {/* Ears (small, round) */}
      <circle cx="-5" cy="-16" r="3" fill="#8B6B4A" />
      <circle cx="5" cy="-16" r="3" fill="#8B6B4A" />
      <circle cx="-5" cy="-16" r="1.5" fill="#C4A882" />
      <circle cx="5" cy="-16" r="1.5" fill="#C4A882" />
      {/* Bushy tail (signature squirrel feature — curves up and over) */}
      <ellipse cx="10" cy="-4" rx="5" ry="8" fill="#8B6B4A" transform="rotate(-20, 10, -4)" />
      <ellipse cx="11" cy="-6" rx="3" ry="5" fill="#A0845E" transform="rotate(-20, 11, -6)" />
      {/* Arms (small, held up as if searching) */}
      <rect x="-9" y="0" width="3" height="6" fill="#8B6B4A" rx="1" />
      <rect x="7" y="0" width="3" height="6" fill="#8B6B4A" rx="1" />
      {/* Feet */}
      <rect x="-6" y="12" width="4" height="3" fill="#6B5340" rx="1" />
      <rect x="3" y="12" width="4" height="3" fill="#6B5340" rx="1" />
      {/* Tiny magnifying glass accessory */}
      <g transform="translate(-12, -6)">
        <circle cx="0" cy="0" r="3.5" fill="none" stroke="#26C6DA" strokeWidth="1" opacity="0.8" />
        <line x1="2" y1="2" x2="5" y2="5" stroke="#26C6DA" strokeWidth="1" opacity="0.8" />
        <circle cx="0" cy="0" r="2" fill="rgba(38, 198, 218, 0.1)" />
      </g>
    </g>
  );
}
