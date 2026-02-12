interface Props { stage: number; }

export function Beaver({ stage }: Props) {
  return (
    <g>
      {/* Body */}
      <rect x="-8" y="-4" width="16" height="14" fill="#8B6914" rx="2" />
      {/* Head */}
      <rect x="-7" y="-14" width="14" height="12" fill="#A0792C" rx="2" />
      {/* Eyes */}
      <rect x="-4" y="-11" width="3" height="3" fill="#1a1a2e" />
      <rect x="2" y="-11" width="3" height="3" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-3" y="-10" width="1" height="1" fill="#ffffff" />
      <rect x="3" y="-10" width="1" height="1" fill="#ffffff" />
      {/* Teeth */}
      <rect x="-2" y="-3" width="2" height="3" fill="#F8F9FA" />
      <rect x="1" y="-3" width="2" height="3" fill="#F8F9FA" />
      {/* Nose */}
      <rect x="-1" y="-5" width="3" height="2" fill="#5a3a1a" />
      {/* Ears */}
      <rect x="-8" y="-16" width="4" height="4" fill="#A0792C" rx="1" />
      <rect x="5" y="-16" width="4" height="4" fill="#A0792C" rx="1" />
      {/* Tail (flat beaver tail) */}
      <ellipse cx="0" cy="14" rx="6" ry="3" fill="#5a3a1a" />
      {/* Belly */}
      <rect x="-5" y="0" width="10" height="8" fill="#C4A44A" rx="1" />
      {/* Feet */}
      <rect x="-8" y="10" width="5" height="3" fill="#8B6914" rx="1" />
      <rect x="4" y="10" width="5" height="3" fill="#8B6914" rx="1" />

      {/* Stage 2: Hard hat */}
      {stage >= 2 && (
        <g>
          <rect x="-8" y="-18" width="16" height="4" fill="#FFD700" rx="1" />
          <rect x="-6" y="-20" width="12" height="3" fill="#FFD700" rx="1" />
        </g>
      )}

      {/* Stage 3: Tool belt + bigger */}
      {stage >= 3 && (
        <g>
          <rect x="-10" y="2" width="20" height="3" fill="#5a3a1a" />
          <rect x="-9" y="1" width="3" height="5" fill="#888" rx="1" />
          <rect x="7" y="1" width="3" height="5" fill="#888" rx="1" />
          {/* Crown accent on hard hat */}
          <rect x="-2" y="-22" width="4" height="3" fill="#FFD700" />
          <rect x="-1" y="-23" width="2" height="2" fill="#FFF" />
        </g>
      )}
    </g>
  );
}
