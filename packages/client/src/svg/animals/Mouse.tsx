interface Props { stage: number; }

/** General-purpose subagent — a small, versatile mouse */
export function Mouse({ stage }: Props) {
  return (
    <g>
      {/* Body (small, round) */}
      <ellipse cx="0" cy="4" rx="7" ry="9" fill="#9E9E9E" />
      {/* Belly */}
      <ellipse cx="0" cy="6" rx="5" ry="6" fill="#BDBDBD" />
      {/* Head */}
      <circle cx="0" cy="-8" r="7" fill="#9E9E9E" />
      {/* Muzzle */}
      <ellipse cx="0" cy="-4" rx="3" ry="2.5" fill="#BDBDBD" />
      {/* Eyes (larger relative to head, like a mouse) */}
      <rect x="-4" y="-11" width="3" height="3" fill="#1a1a2e" />
      <rect x="2" y="-11" width="3" height="3" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-3" y="-10" width="1" height="1" fill="#ffffff" />
      <rect x="3" y="-10" width="1" height="1" fill="#ffffff" />
      {/* Nose */}
      <circle cx="0" cy="-4" r="1.5" fill="#F5A0A0" />
      {/* Whiskers */}
      <line x1="-7" y1="-5" x2="-2" y2="-4" stroke="#757575" strokeWidth="0.5" />
      <line x1="-7" y1="-3" x2="-2" y2="-3" stroke="#757575" strokeWidth="0.5" />
      <line x1="2" y1="-4" x2="7" y2="-5" stroke="#757575" strokeWidth="0.5" />
      <line x1="2" y1="-3" x2="7" y2="-3" stroke="#757575" strokeWidth="0.5" />
      {/* Ears (large, round — signature mouse feature) */}
      <circle cx="-5" cy="-14" r="4" fill="#9E9E9E" />
      <circle cx="5" cy="-14" r="4" fill="#9E9E9E" />
      <circle cx="-5" cy="-14" r="2.5" fill="#F5A0A0" opacity="0.4" />
      <circle cx="5" cy="-14" r="2.5" fill="#F5A0A0" opacity="0.4" />
      {/* Thin tail (long, curving) */}
      <path d="M 5,10 Q 12,8 14,14 Q 16,18 13,20" fill="none" stroke="#757575" strokeWidth="1.5" strokeLinecap="round" />
      {/* Arms */}
      <rect x="-9" y="0" width="3" height="5" fill="#9E9E9E" rx="1" />
      <rect x="7" y="0" width="3" height="5" fill="#9E9E9E" rx="1" />
      {/* Feet */}
      <rect x="-6" y="12" width="4" height="2.5" fill="#757575" rx="1" />
      <rect x="3" y="12" width="4" height="2.5" fill="#757575" rx="1" />
    </g>
  );
}
