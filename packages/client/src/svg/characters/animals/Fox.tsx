interface Props { stage: number; }

export function Fox({ stage }: Props) {
  return (
    <g>
      {/* Body */}
      <rect x="-8" y="-2" width="16" height="16" fill="#D4652B" rx="2" />
      {/* Belly */}
      <rect x="-5" y="2" width="10" height="10" fill="#F5C99E" rx="1" />
      {/* Head */}
      <rect x="-8" y="-14" width="16" height="14" fill="#D4652B" rx="2" />
      {/* Face markings */}
      <polygon points="-2,-4 0,-1 2,-4" fill="#F5C99E" />
      {/* Eyes */}
      <rect x="-5" y="-10" width="3" height="2" fill="#1a1a2e" />
      <rect x="3" y="-10" width="3" height="2" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-4" y="-10" width="1" height="1" fill="#ffffff" />
      <rect x="4" y="-10" width="1" height="1" fill="#ffffff" />
      {/* Nose */}
      <rect x="-1" y="-5" width="3" height="2" fill="#1a1a2e" />
      {/* Ears (triangular fox ears) */}
      <polygon points="-9,-14 -6,-22 -3,-14" fill="#D4652B" />
      <polygon points="3,-14 6,-22 9,-14" fill="#D4652B" />
      <polygon points="-7,-14 -6,-19 -4,-14" fill="#F5C99E" />
      <polygon points="4,-14 6,-19 7,-14" fill="#F5C99E" />
      {/* Tail (bushy fox tail) */}
      <ellipse cx="12" cy="8" rx="6" ry="4" fill="#D4652B" transform="rotate(-30, 12, 8)" />
      <ellipse cx="15" cy="6" rx="3" ry="2" fill="#F5C99E" transform="rotate(-30, 15, 6)" />
      {/* Feet */}
      <rect x="-8" y="14" width="5" height="3" fill="#1a1a2e" rx="1" />
      <rect x="4" y="14" width="5" height="3" fill="#1a1a2e" rx="1" />

      {/* Stage 2: Wrench */}
      {stage >= 2 && (
        <g transform="translate(14, -8) rotate(30)">
          <rect x="-1" y="-8" width="2" height="12" fill="#888" />
          <rect x="-3" y="-10" width="6" height="3" fill="#888" rx="1" />
        </g>
      )}

      {/* Stage 3: Welding goggles + sparks */}
      {stage >= 3 && (
        <g>
          <rect x="-7" y="-12" width="6" height="4" fill="#333" rx="1" stroke="#DC3545" strokeWidth="0.5" />
          <rect x="2" y="-12" width="6" height="4" fill="#333" rx="1" stroke="#DC3545" strokeWidth="0.5" />
          <line x1="-1" y1="-10" x2="2" y2="-10" stroke="#DC3545" strokeWidth="1" />
          {/* Flame accents */}
          <rect x="-10" y="-2" width="2" height="2" fill="#DC3545" opacity="0.7" />
          <rect x="-11" y="-4" width="2" height="2" fill="#FFD700" opacity="0.5" />
        </g>
      )}
    </g>
  );
}
