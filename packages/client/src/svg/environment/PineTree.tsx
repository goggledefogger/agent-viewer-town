interface Props {
  variant?: number;
}

/** Pixel-art pine tree with more detail */
export function PineTree({ variant = 0 }: Props) {
  const greens = ['#2d5a27', '#3a7a34', '#1a4a1a'];
  const primary = greens[variant % greens.length];
  const lighter = greens[(variant + 1) % greens.length];

  return (
    <g>
      {/* Trunk */}
      <rect x="-3" y="10" width="6" height="14" fill="#5a3a1a" />
      <rect x="-2" y="12" width="2" height="8" fill="#4a2a0a" opacity="0.3" />
      {/* Bottom tier */}
      <polygon points="-18,12 0,-4 18,12" fill={primary} />
      {/* Middle tier */}
      <polygon points="-14,4 0,-14 14,4" fill={lighter} />
      {/* Top tier */}
      <polygon points="-10,-4 0,-22 10,-4" fill={primary} />
      {/* Snow caps / light patches */}
      <rect x="-2" y="-18" width="4" height="2" fill="#F8F9FA" opacity="0.2" />
      <rect x="-6" y="-8" width="3" height="1" fill="#F8F9FA" opacity="0.15" />
      <rect x="4" y="0" width="3" height="1" fill="#F8F9FA" opacity="0.15" />
    </g>
  );
}
