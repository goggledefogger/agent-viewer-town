interface Props {
  variant?: number;
}

/** Pixel-art mushroom decoration */
export function Mushroom({ variant = 0 }: Props) {
  const caps = ['#DC3545', '#FFD700', '#9B59B6'];
  const spots = ['#F8F9FA', '#FFF5EE', '#E8DDD0'];
  const capColor = caps[variant % caps.length];
  const spotColor = spots[variant % spots.length];

  return (
    <g>
      {/* Stem */}
      <rect x="-2" y="0" width="4" height="6" fill="#F5F0E1" />
      <rect x="-1" y="1" width="1" height="4" fill="#E8DDD0" opacity="0.5" />
      {/* Cap */}
      <ellipse cx="0" cy="0" rx="6" ry="4" fill={capColor} />
      <ellipse cx="0" cy="-1" rx="5" ry="3" fill={capColor} />
      {/* Spots */}
      <circle cx="-3" cy="-1" r="1" fill={spotColor} />
      <circle cx="2" cy="-2" r="0.8" fill={spotColor} />
      <circle cx="0" cy="0" r="0.6" fill={spotColor} />
      {/* Cap underside line */}
      <ellipse cx="0" cy="1" rx="5" ry="1" fill="none" stroke={capColor} strokeWidth="0.5" opacity="0.5" />
    </g>
  );
}
