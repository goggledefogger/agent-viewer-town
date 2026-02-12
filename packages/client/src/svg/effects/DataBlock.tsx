interface Props {
  color?: string;
}

/** Lego-shaped data block for conveyor animations */
export function DataBlock({ color = '#4169E1' }: Props) {
  return (
    <g>
      {/* Block body */}
      <rect x="-5" y="-3" width="10" height="6" fill={color} rx="1" />
      {/* Top studs (Lego bumps) */}
      <rect x="-4" y="-5" width="3" height="2" fill={color} rx="0.5" />
      <rect x="1" y="-5" width="3" height="2" fill={color} rx="0.5" />
      {/* Highlight */}
      <rect x="-4" y="-2" width="8" height="1" fill="#F8F9FA" opacity="0.15" />
      {/* Shadow */}
      <rect x="-4" y="2" width="8" height="1" fill="#000" opacity="0.15" />
      {/* Data pattern on face */}
      <rect x="-3" y="-1" width="1" height="1" fill="#F8F9FA" opacity="0.3" />
      <rect x="-1" y="-1" width="1" height="1" fill="#F8F9FA" opacity="0.2" />
      <rect x="1" y="-1" width="1" height="1" fill="#F8F9FA" opacity="0.3" />
      <rect x="3" y="-1" width="1" height="1" fill="#F8F9FA" opacity="0.2" />
      <rect x="-2" y="0.5" width="1" height="1" fill="#F8F9FA" opacity="0.2" />
      <rect x="0" y="0.5" width="1" height="1" fill="#F8F9FA" opacity="0.3" />
      <rect x="2" y="0.5" width="1" height="1" fill="#F8F9FA" opacity="0.2" />
    </g>
  );
}
