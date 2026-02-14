interface Props { stage: number; }

/** Plan subagent — a methodical chipmunk carefully organizing */
export function Chipmunk({ stage }: Props) {
  return (
    <g>
      {/* Body (round, compact) */}
      <ellipse cx="0" cy="4" rx="8" ry="10" fill="#A0784C" />
      {/* Belly */}
      <ellipse cx="0" cy="6" rx="5" ry="7" fill="#D4B896" />
      {/* Back stripes (signature chipmunk feature) */}
      <rect x="-2" y="-4" width="1.5" height="14" fill="#5C4033" rx="0.5" />
      <rect x="1" y="-4" width="1.5" height="14" fill="#5C4033" rx="0.5" />
      <rect x="-5" y="-2" width="1.5" height="10" fill="#5C4033" rx="0.5" />
      <rect x="4" y="-2" width="1.5" height="10" fill="#5C4033" rx="0.5" />
      {/* Head */}
      <circle cx="0" cy="-10" r="7" fill="#A0784C" />
      {/* Face stripe */}
      <rect x="-0.5" y="-16" width="1" height="8" fill="#D4B896" />
      {/* Cheek pouches (puffy, signature chipmunk) */}
      <ellipse cx="-5" cy="-6" rx="3" ry="3" fill="#D4B896" />
      <ellipse cx="5" cy="-6" rx="3" ry="3" fill="#D4B896" />
      {/* Eyes */}
      <rect x="-4" y="-11" width="3" height="3" fill="#1a1a2e" />
      <rect x="2" y="-11" width="3" height="3" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-3" y="-10" width="1" height="1" fill="#FFCA28" />
      <rect x="3" y="-10" width="1" height="1" fill="#FFCA28" />
      {/* Nose */}
      <rect x="-1" y="-6" width="2" height="1.5" fill="#5a3a1a" rx="0.5" />
      {/* Ears (small, round) */}
      <circle cx="-5" cy="-16" r="2.5" fill="#A0784C" />
      <circle cx="5" cy="-16" r="2.5" fill="#A0784C" />
      <circle cx="-5" cy="-16" r="1.5" fill="#C4A882" />
      <circle cx="5" cy="-16" r="1.5" fill="#C4A882" />
      {/* Small tail (shorter than squirrel, curved up) */}
      <ellipse cx="9" cy="2" rx="3" ry="5" fill="#A0784C" transform="rotate(-15, 9, 2)" />
      {/* Arms */}
      <rect x="-10" y="0" width="3" height="6" fill="#A0784C" rx="1" />
      <rect x="8" y="0" width="3" height="6" fill="#A0784C" rx="1" />
      {/* Feet */}
      <rect x="-6" y="13" width="4" height="3" fill="#7A5C3A" rx="1" />
      <rect x="3" y="13" width="4" height="3" fill="#7A5C3A" rx="1" />
      {/* Small clipboard accessory */}
      <g transform="translate(-13, -2)">
        <rect x="-3" y="-3" width="5" height="7" fill="#FFCA28" opacity="0.7" rx="0.5" />
        <rect x="-2.5" y="-4" width="4" height="2" fill="#B8941E" opacity="0.7" rx="0.5" />
        <line x1="-1.5" y1="-0.5" x2="1" y2="-0.5" stroke="#5C4033" strokeWidth="0.5" opacity="0.6" />
        <line x1="-1.5" y1="1" x2="1" y2="1" stroke="#5C4033" strokeWidth="0.5" opacity="0.6" />
      </g>
    </g>
  );
}
