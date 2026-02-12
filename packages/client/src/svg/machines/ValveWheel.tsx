interface Props {
  color?: string;
  open?: boolean;
}

/** Valve wheel that can be open or closed */
export function ValveWheel({ color = '#FFD700', open = true }: Props) {
  const rotation = open ? 0 : 45;
  return (
    <g transform={`rotate(${rotation})`}>
      {/* Valve housing */}
      <rect x="-4" y="6" width="8" height="6" fill="#555" rx="1" />
      <rect x="-6" y="8" width="12" height="3" fill="#444" rx="1" />
      {/* Wheel rim */}
      <circle cx="0" cy="0" r="7" fill="none" stroke={color} strokeWidth="2" />
      {/* Wheel spokes */}
      <line x1="0" y1="-7" x2="0" y2="7" stroke={color} strokeWidth="1.5" />
      <line x1="-7" y1="0" x2="7" y2="0" stroke={color} strokeWidth="1.5" />
      <line x1="-5" y1="-5" x2="5" y2="5" stroke={color} strokeWidth="1" />
      <line x1="5" y1="-5" x2="-5" y2="5" stroke={color} strokeWidth="1" />
      {/* Center hub */}
      <circle cx="0" cy="0" r="2.5" fill="#555" stroke={color} strokeWidth="1" />
      <circle cx="0" cy="0" r="1" fill={color} />
    </g>
  );
}
