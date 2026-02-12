interface Props {
  color?: string;
}

/** Spark particle burst effect */
export function SparkParticles({ color = '#FFD700' }: Props) {
  return (
    <g>
      {/* Center spark */}
      <rect x="-1" y="-1" width="2" height="2" fill={color} opacity="0.9" />
      {/* Radiating sparks */}
      <rect x="-6" y="-1" width="2" height="1" fill={color} opacity="0.7" />
      <rect x="4" y="0" width="2" height="1" fill={color} opacity="0.6" />
      <rect x="0" y="-6" width="1" height="2" fill={color} opacity="0.7" />
      <rect x="-1" y="4" width="1" height="2" fill={color} opacity="0.5" />
      {/* Diagonal sparks */}
      <rect x="-5" y="-5" width="1" height="1" fill={color} opacity="0.5" />
      <rect x="4" y="-4" width="1" height="1" fill={color} opacity="0.4" />
      <rect x="-4" y="4" width="1" height="1" fill={color} opacity="0.4" />
      <rect x="5" y="3" width="1" height="1" fill={color} opacity="0.3" />
      {/* Tiny distant particles */}
      <rect x="-8" y="2" width="1" height="1" fill={color} opacity="0.2" />
      <rect x="7" y="-2" width="1" height="1" fill={color} opacity="0.2" />
      <rect x="2" y="-8" width="1" height="1" fill={color} opacity="0.2" />
    </g>
  );
}
