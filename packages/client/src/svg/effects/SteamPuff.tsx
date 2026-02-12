interface Props {
  variant?: number;
}

/** Animated steam puff particle effect */
export function SteamPuff({ variant = 0 }: Props) {
  const offset = variant * 3;
  return (
    <g opacity="0.4">
      {/* Bottom puff (larger, more opaque) */}
      <circle
        cx={0 + offset}
        cy={4}
        r="3"
        fill="#F8F9FA"
        opacity="0.3"
        className="steam-puff"
      />
      {/* Middle puff */}
      <circle
        cx={-2 + offset}
        cy={-2}
        r="2.5"
        fill="#F8F9FA"
        opacity="0.25"
        className="steam-puff"
      />
      {/* Top puff (smallest, fading) */}
      <circle
        cx={1 + offset}
        cy={-7}
        r="2"
        fill="#F8F9FA"
        opacity="0.15"
        className="steam-puff"
      />
      {/* Tiny wisps */}
      <rect x={-1 + offset} y={-10} width="1" height="2" fill="#F8F9FA" opacity="0.1" rx="0.5" />
    </g>
  );
}
