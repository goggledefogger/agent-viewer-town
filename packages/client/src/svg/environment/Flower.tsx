interface Props {
  variant?: number;
}

/** Pixel-art flower decoration */
export function Flower({ variant = 0 }: Props) {
  const petals = ['#FFB6C1', '#87CEEB', '#FFD700', '#DC3545'];
  const centers = ['#FFD700', '#FF6B6B', '#F8F9FA', '#FFD700'];
  const petalColor = petals[variant % petals.length];
  const centerColor = centers[variant % centers.length];

  return (
    <g>
      {/* Stem */}
      <rect x="-0.5" y="0" width="1" height="8" fill="#3a7a34" />
      {/* Leaf */}
      <ellipse cx="-2" cy="4" rx="2" ry="1" fill="#3a7a34" transform="rotate(-20, -2, 4)" />
      {/* Petals */}
      <rect x="-1" y="-5" width="2" height="3" fill={petalColor} rx="1" />
      <rect x="-1" y="0" width="2" height="3" fill={petalColor} rx="1" />
      <rect x="-4" y="-2" width="3" height="2" fill={petalColor} rx="1" />
      <rect x="1" y="-2" width="3" height="2" fill={petalColor} rx="1" />
      {/* Center */}
      <circle cx="0" cy="-1" r="1.5" fill={centerColor} />
    </g>
  );
}
