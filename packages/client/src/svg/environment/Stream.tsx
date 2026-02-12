/** Pixel-art flowing stream/river section */
export function Stream() {
  return (
    <g>
      {/* River bed */}
      <path
        d="M -60,0 Q -30,-8 0,0 Q 30,8 60,0"
        fill="none"
        stroke="#0f3460"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {/* Water surface */}
      <path
        d="M -60,0 Q -30,-8 0,0 Q 30,8 60,0"
        fill="none"
        stroke="#1a5a8a"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Water highlights */}
      <path
        d="M -60,0 Q -30,-8 0,0 Q 30,8 60,0"
        fill="none"
        stroke="#2a7aba"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* Ripple marks */}
      <rect x="-30" y="-2" width="6" height="1" fill="#4a9ada" opacity="0.4" rx="0.5" />
      <rect x="10" y="1" width="4" height="1" fill="#4a9ada" opacity="0.3" rx="0.5" />
      <rect x="-10" y="0" width="5" height="1" fill="#4a9ada" opacity="0.4" rx="0.5" />
      {/* Rocks in stream */}
      <ellipse cx="-20" cy="2" rx="3" ry="2" fill="#555" />
      <ellipse cx="25" cy="-1" rx="2" ry="1.5" fill="#666" />
    </g>
  );
}
