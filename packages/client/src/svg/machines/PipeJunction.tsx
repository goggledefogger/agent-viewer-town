interface Props {
  color?: string;
}

/** Pipe junction node where multiple pipes meet */
export function PipeJunction({ color = '#4169E1' }: Props) {
  return (
    <g>
      {/* Junction hub */}
      <circle cx="0" cy="0" r="8" fill="#334155" stroke="#1e293b" strokeWidth="2" />
      <circle cx="0" cy="0" r="5" fill="#1e293b" />
      {/* Center bolt */}
      <circle cx="0" cy="0" r="2.5" fill="#555" stroke="#666" strokeWidth="0.5" />
      {/* Bolt cross pattern */}
      <rect x="-0.5" y="-2" width="1" height="4" fill="#777" />
      <rect x="-2" y="-0.5" width="4" height="1" fill="#777" />
      {/* Status indicator ring */}
      <circle cx="0" cy="0" r="6.5" fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
      {/* Pipe stubs extending from junction */}
      <rect x="8" y="-3" width="6" height="6" fill="#334155" rx="1" />
      <rect x="-14" y="-3" width="6" height="6" fill="#334155" rx="1" />
      <rect x="-3" y="-14" width="6" height="6" fill="#334155" rx="1" />
      <rect x="-3" y="8" width="6" height="6" fill="#334155" rx="1" />
      {/* Rivets */}
      <circle cx="6" cy="-6" r="1" fill="#555" />
      <circle cx="-6" cy="-6" r="1" fill="#555" />
      <circle cx="6" cy="6" r="1" fill="#555" />
      <circle cx="-6" cy="6" r="1" fill="#555" />
    </g>
  );
}
