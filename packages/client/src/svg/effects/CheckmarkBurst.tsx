interface Props {
  color?: string;
}

/** Checkmark burst effect for task completion */
export function CheckmarkBurst({ color = '#28A745' }: Props) {
  return (
    <g>
      {/* Burst rays */}
      <line x1="0" y1="-10" x2="0" y2="-6" stroke={color} strokeWidth="1" opacity="0.4" />
      <line x1="7" y1="-7" x2="4" y2="-4" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="10" y1="0" x2="6" y2="0" stroke={color} strokeWidth="1" opacity="0.4" />
      <line x1="7" y1="7" x2="4" y2="4" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="0" y1="10" x2="0" y2="6" stroke={color} strokeWidth="1" opacity="0.4" />
      <line x1="-7" y1="7" x2="-4" y2="4" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="-10" y1="0" x2="-6" y2="0" stroke={color} strokeWidth="1" opacity="0.4" />
      <line x1="-7" y1="-7" x2="-4" y2="-4" stroke={color} strokeWidth="1" opacity="0.3" />
      {/* Circle background */}
      <circle cx="0" cy="0" r="5" fill={color} opacity="0.15" />
      {/* Checkmark */}
      <polyline
        points="-3,0 -1,3 4,-3"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
