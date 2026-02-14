interface Props { stage: number; }

export function Owl({ stage }: Props) {
  return (
    <g>
      {/* Body */}
      <ellipse cx="0" cy="4" rx="10" ry="12" fill="#6B5B3A" />
      {/* Belly feathers */}
      <ellipse cx="0" cy="6" rx="7" ry="8" fill="#8B7B5A" />
      {/* Head */}
      <circle cx="0" cy="-12" r="9" fill="#6B5B3A" />
      {/* Face disk */}
      <circle cx="0" cy="-11" r="7" fill="#8B7B5A" />
      {/* Eyes (large owl eyes) */}
      <circle cx="-4" cy="-12" r="4" fill="#FFF" />
      <circle cx="4" cy="-12" r="4" fill="#FFF" />
      <circle cx="-4" cy="-12" r="2" fill="#1a1a2e" />
      <circle cx="4" cy="-12" r="2" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-3" y="-13" width="1" height="1" fill="#ffffff" />
      <rect x="5" y="-13" width="1" height="1" fill="#ffffff" />
      {/* Beak */}
      <polygon points="-2,-8 2,-8 0,-5" fill="#E8A735" />
      {/* Ear tufts */}
      <polygon points="-7,-18 -5,-22 -3,-18" fill="#6B5B3A" />
      <polygon points="3,-18 5,-22 7,-18" fill="#6B5B3A" />
      {/* Wings */}
      <ellipse cx="-11" cy="2" rx="4" ry="8" fill="#5a4a2a" />
      <ellipse cx="11" cy="2" rx="4" ry="8" fill="#5a4a2a" />
      {/* Feet */}
      <g fill="#E8A735">
        <rect x="-6" y="14" width="2" height="3" />
        <rect x="-3" y="14" width="2" height="3" />
        <rect x="2" y="14" width="2" height="3" />
        <rect x="5" y="14" width="2" height="3" />
      </g>

      {/* Stage 2: Spectacles */}
      {stage >= 2 && (
        <g stroke="#4169E1" strokeWidth="1" fill="none">
          <circle cx="-4" cy="-12" r="5" />
          <circle cx="4" cy="-12" r="5" />
          <line x1="1" y1="-12" x2="-1" y2="-12" />
        </g>
      )}

      {/* Stage 3: Wizard hat + book */}
      {stage >= 3 && (
        <g>
          <polygon points="-6,-20 0,-32 6,-20" fill="#4169E1" />
          <rect x="-7" y="-21" width="14" height="3" fill="#4169E1" rx="1" />
          <rect x="-1" y="-28" width="2" height="2" fill="#FFD700" />
          {/* Book under wing */}
          <rect x="12" y="0" width="6" height="8" fill="#4169E1" rx="1" />
          <line x1="15" y1="1" x2="15" y2="7" stroke="#FFD700" strokeWidth="0.5" />
        </g>
      )}
    </g>
  );
}
