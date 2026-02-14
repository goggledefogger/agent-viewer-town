interface Props { stage: number; }

export function Rabbit({ stage }: Props) {
  return (
    <g>
      {/* Body */}
      <ellipse cx="0" cy="4" rx="8" ry="10" fill="#E8DDD0" />
      {/* Belly */}
      <ellipse cx="0" cy="6" rx="5" ry="7" fill="#FFF5EE" />
      {/* Head */}
      <circle cx="0" cy="-10" r="8" fill="#E8DDD0" />
      {/* Cheeks */}
      <circle cx="-5" cy="-6" r="2" fill="#FFB6C1" opacity="0.5" />
      <circle cx="5" cy="-6" r="2" fill="#FFB6C1" opacity="0.5" />
      {/* Eyes */}
      <circle cx="-3" cy="-11" r="2" fill="#1a1a2e" />
      <circle cx="3" cy="-11" r="2" fill="#1a1a2e" />
      {/* Eye shine */}
      <rect x="-2" y="-12" width="1" height="1" fill="#ffffff" />
      <rect x="4" y="-12" width="1" height="1" fill="#ffffff" />
      {/* Nose */}
      <polygon points="-1,-7 1,-7 0,-6" fill="#FFB6C1" />
      {/* Mouth */}
      <line x1="0" y1="-6" x2="-1" y2="-4" stroke="#5C4033" strokeWidth="0.5" />
      <line x1="0" y1="-6" x2="1" y2="-4" stroke="#5C4033" strokeWidth="0.5" />
      {/* Long ears */}
      <ellipse cx="-4" cy="-24" rx="3" ry="10" fill="#E8DDD0" />
      <ellipse cx="4" cy="-24" rx="3" ry="10" fill="#E8DDD0" />
      <ellipse cx="-4" cy="-24" rx="2" ry="8" fill="#FFB6C1" opacity="0.3" />
      <ellipse cx="4" cy="-24" rx="2" ry="8" fill="#FFB6C1" opacity="0.3" />
      {/* Feet */}
      <ellipse cx="-5" cy="14" rx="4" ry="2" fill="#E8DDD0" />
      <ellipse cx="5" cy="14" rx="4" ry="2" fill="#E8DDD0" />
      {/* Cottontail */}
      <circle cx="0" cy="14" r="3" fill="#FFF5EE" />

      {/* Stage 2: Compass/protractor */}
      {stage >= 2 && (
        <g transform="translate(12, -4)">
          <circle cx="0" cy="0" r="5" fill="none" stroke="#F8F9FA" strokeWidth="1" />
          <line x1="0" y1="0" x2="3" y2="-3" stroke="#F8F9FA" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#F8F9FA" strokeWidth="1" />
          <circle cx="0" cy="0" r="1" fill="#F8F9FA" />
        </g>
      )}

      {/* Stage 3: Blueprint scroll + quill */}
      {stage >= 3 && (
        <g>
          {/* Blueprint */}
          <rect x="-14" y="-2" width="6" height="10" fill="#4169E1" rx="1" />
          <line x1="-12" y1="0" x2="-10" y2="0" stroke="#FFF" strokeWidth="0.5" />
          <line x1="-12" y1="2" x2="-10" y2="2" stroke="#FFF" strokeWidth="0.5" />
          <line x1="-12" y1="4" x2="-10" y2="4" stroke="#FFF" strokeWidth="0.5" />
          {/* Quill behind ear */}
          <line x1="6" y1="-28" x2="8" y2="-18" stroke="#FFD700" strokeWidth="1" />
          <polygon points="5,-30 7,-28 6,-28" fill="#F8F9FA" />
        </g>
      )}
    </g>
  );
}
