interface Props { stage: number; }

export function Bear({ stage }: Props) {
  return (
    <g>
      {/* Body (chunky bear) */}
      <rect x="-10" y="-4" width="20" height="18" fill="#5C4033" rx="3" />
      {/* Belly */}
      <ellipse cx="0" cy="4" rx="7" ry="8" fill="#8B7355" />
      {/* Head */}
      <rect x="-9" y="-16" width="18" height="14" fill="#5C4033" rx="3" />
      {/* Muzzle */}
      <ellipse cx="0" cy="-6" rx="5" ry="4" fill="#8B7355" />
      {/* Eyes */}
      <rect x="-5" y="-12" width="3" height="3" fill="#1a1a2e" />
      <rect x="3" y="-12" width="3" height="3" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-4" y="-11" width="1" height="1" fill="#ffffff" />
      <rect x="4" y="-11" width="1" height="1" fill="#ffffff" />
      {/* Nose */}
      <rect x="-2" y="-7" width="4" height="3" fill="#1a1a2e" rx="1" />
      {/* Ears (round bear ears) */}
      <circle cx="-8" cy="-17" r="4" fill="#5C4033" />
      <circle cx="8" cy="-17" r="4" fill="#5C4033" />
      <circle cx="-8" cy="-17" r="2" fill="#8B7355" />
      <circle cx="8" cy="-17" r="2" fill="#8B7355" />
      {/* Arms */}
      <rect x="-14" y="-2" width="5" height="12" fill="#5C4033" rx="2" />
      <rect x="10" y="-2" width="5" height="12" fill="#5C4033" rx="2" />
      {/* Feet */}
      <rect x="-10" y="14" width="7" height="4" fill="#5C4033" rx="2" />
      <rect x="4" y="14" width="7" height="4" fill="#5C4033" rx="2" />
      {/* Paw pads */}
      <rect x="-8" y="15" width="3" height="2" fill="#8B7355" rx="1" />
      <rect x="6" y="15" width="3" height="2" fill="#8B7355" rx="1" />

      {/* Stage 2: Magnifying glass */}
      {stage >= 2 && (
        <g transform="translate(16, -6)">
          <circle cx="0" cy="0" r="5" fill="none" stroke="#28A745" strokeWidth="2" />
          <line x1="3" y1="3" x2="8" y2="8" stroke="#28A745" strokeWidth="2" />
          <circle cx="0" cy="0" r="3" fill="rgba(40, 167, 69, 0.1)" />
        </g>
      )}

      {/* Stage 3: Armor vest + shield */}
      {stage >= 3 && (
        <g>
          <rect x="-10" y="-3" width="20" height="14" fill="none" stroke="#28A745" strokeWidth="1.5" rx="2" />
          <line x1="0" y1="-3" x2="0" y2="11" stroke="#28A745" strokeWidth="1" />
          <line x1="-10" y1="4" x2="10" y2="4" stroke="#28A745" strokeWidth="1" />
          {/* Shield icon on chest */}
          <polygon points="0,-1 -4,2 -3,6 0,8 3,6 4,2" fill="rgba(40, 167, 69, 0.3)" stroke="#28A745" strokeWidth="0.8" />
          <rect x="-1" y="1" width="2" height="4" fill="#28A745" />
          <rect x="-2" y="2" width="4" height="2" fill="#28A745" />
        </g>
      )}
    </g>
  );
}
