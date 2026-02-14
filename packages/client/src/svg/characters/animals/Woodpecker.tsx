interface Props { stage: number; }

/** Bash subagent — a woodpecker tapping out commands */
export function Woodpecker({ stage }: Props) {
  return (
    <g>
      {/* Body (upright, vertically oriented) */}
      <ellipse cx="0" cy="4" rx="6" ry="10" fill="#2C2C2C" />
      {/* Belly (white breast) */}
      <ellipse cx="0" cy="5" rx="4" ry="7" fill="#E8E0D4" />
      {/* Head */}
      <circle cx="0" cy="-10" r="6.5" fill="#2C2C2C" />
      {/* Red crest (signature woodpecker feature) */}
      <ellipse cx="0" cy="-17" rx="4" ry="3" fill="#D4421A" />
      <rect x="-3" y="-17" width="6" height="4" fill="#D4421A" rx="1" />
      {/* White face stripe */}
      <rect x="-6" y="-10" width="12" height="2" fill="#E8E0D4" rx="0.5" />
      {/* Eyes */}
      <rect x="-4" y="-11" width="3" height="3" fill="#1a1a2e" />
      <rect x="2" y="-11" width="3" height="3" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-3" y="-10" width="1" height="1" fill="#FF7043" />
      <rect x="3" y="-10" width="1" height="1" fill="#FF7043" />
      {/* Beak (long, pointed — signature woodpecker) */}
      <polygon points="-2,-7 2,-7 0,-2" fill="#4A4A4A" />
      <polygon points="-1,-7 1,-7 6,-6" fill="#5C5C5C" />
      {/* Wings (folded along body) */}
      <ellipse cx="-7" cy="2" rx="3" ry="7" fill="#3A3A3A" />
      <ellipse cx="7" cy="2" rx="3" ry="7" fill="#3A3A3A" />
      {/* Wing feather markings */}
      <rect x="-9" y="0" width="1" height="4" fill="#E8E0D4" opacity="0.5" />
      <rect x="9" y="0" width="1" height="4" fill="#E8E0D4" opacity="0.5" />
      {/* Tail feathers (stiff, used for bracing against trees) */}
      <rect x="-3" y="13" width="2" height="4" fill="#2C2C2C" rx="0.5" />
      <rect x="-1" y="14" width="2" height="3" fill="#2C2C2C" rx="0.5" />
      <rect x="1" y="13" width="2" height="4" fill="#2C2C2C" rx="0.5" />
      {/* Feet (clinging feet) */}
      <rect x="-5" y="12" width="3" height="2" fill="#4A4A4A" rx="0.5" />
      <rect x="3" y="12" width="3" height="2" fill="#4A4A4A" rx="0.5" />
      {/* Terminal prompt accessory >_ */}
      <g transform="translate(12, -8)" opacity="0.75">
        <text x="0" y="0" fill="#FF7043" fontSize="7" fontFamily="'Courier New', monospace" fontWeight="bold">{'>_'}</text>
      </g>
    </g>
  );
}
