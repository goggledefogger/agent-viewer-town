/** Rabbit (planner) workstation: blueprint drafting table */
export function DraftingTable() {
  return (
    <g>
      {/* Table surface (angled for drafting) */}
      <g transform="rotate(-8)">
        <rect x="-28" y="0" width="56" height="4" fill="#7a5a3a" rx="1" />
        {/* Blueprint on table */}
        <rect x="-22" y="-8" width="44" height="8" fill="#1a3a6a" rx="1" />
        {/* Blueprint grid lines */}
        <line x1="-18" y1="-6" x2="18" y2="-6" stroke="#4169E1" strokeWidth="0.3" opacity="0.5" />
        <line x1="-18" y1="-4" x2="18" y2="-4" stroke="#4169E1" strokeWidth="0.3" opacity="0.5" />
        <line x1="-18" y1="-2" x2="18" y2="-2" stroke="#4169E1" strokeWidth="0.3" opacity="0.5" />
        <line x1="-10" y1="-7" x2="-10" y2="-1" stroke="#4169E1" strokeWidth="0.3" opacity="0.5" />
        <line x1="0" y1="-7" x2="0" y2="-1" stroke="#4169E1" strokeWidth="0.3" opacity="0.5" />
        <line x1="10" y1="-7" x2="10" y2="-1" stroke="#4169E1" strokeWidth="0.3" opacity="0.5" />
        {/* Blueprint drawing - simple floor plan */}
        <rect x="-14" y="-6" width="12" height="4" fill="none" stroke="#F8F9FA" strokeWidth="0.5" />
        <rect x="2" y="-6" width="8" height="4" fill="none" stroke="#F8F9FA" strokeWidth="0.5" />
        <line x1="-2" y1="-5" x2="2" y2="-5" stroke="#F8F9FA" strokeWidth="0.5" />
      </g>
      {/* Table legs */}
      <rect x="-24" y="4" width="3" height="20" fill="#5a3a1a" />
      <rect x="22" y="8" width="3" height="16" fill="#5a3a1a" />
      {/* T-square ruler */}
      <rect x="16" y="-12" width="12" height="1.5" fill="#F8F9FA" opacity="0.7" />
      <rect x="16" y="-14" width="1.5" height="6" fill="#F8F9FA" opacity="0.7" />
      {/* Pencil */}
      <g transform="translate(-24, -6) rotate(-30)">
        <rect x="0" y="0" width="10" height="1.5" fill="#FFD700" />
        <polygon points="10,0 12,0.75 10,1.5" fill="#333" />
      </g>
      {/* Compass tool */}
      <g transform="translate(26, -4)">
        <circle cx="0" cy="0" r="4" fill="none" stroke="#F8F9FA" strokeWidth="0.5" opacity="0.5" />
        <line x1="0" y1="0" x2="3" y2="-2" stroke="#888" strokeWidth="0.8" />
        <line x1="0" y1="0" x2="0" y2="4" stroke="#888" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="0.8" fill="#888" />
      </g>
    </g>
  );
}
