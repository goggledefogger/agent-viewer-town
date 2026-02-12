/** Owl (researcher) workstation: treehouse lookout with telescope */
export function TreehouseLookout() {
  return (
    <g>
      {/* Tree trunk */}
      <rect x="-6" y="4" width="12" height="24" fill="#5a3a1a" />
      <rect x="-4" y="8" width="2" height="3" fill="#4a2a0a" opacity="0.5" />
      <rect x="2" y="14" width="3" height="2" fill="#4a2a0a" opacity="0.5" />
      {/* Platform */}
      <rect x="-30" y="0" width="60" height="5" fill="#7a5a3a" rx="1" />
      <rect x="-28" y="1" width="56" height="3" fill="#6a4a2a" />
      {/* Railing posts */}
      <rect x="-28" y="-12" width="2" height="12" fill="#5a3a1a" />
      <rect x="26" y="-12" width="2" height="12" fill="#5a3a1a" />
      {/* Railing bar */}
      <rect x="-28" y="-12" width="56" height="2" fill="#6a4a2a" rx="1" />
      {/* Telescope */}
      <g transform="translate(18, -10) rotate(-20)">
        <rect x="0" y="-1" width="16" height="3" fill="#4169E1" rx="1" />
        <rect x="14" y="-2" width="4" height="5" fill="#334488" rx="1" />
        <circle cx="18" cy="0.5" r="3" fill="#223366" stroke="#4169E1" strokeWidth="0.5" />
        {/* Lens glare */}
        <rect x="17" y="-1" width="1" height="1" fill="#88AAFF" opacity="0.6" />
      </g>
      {/* Telescope tripod */}
      <line x1="22" y1="-6" x2="18" y2="0" stroke="#555" strokeWidth="1" />
      <line x1="22" y1="-6" x2="26" y2="0" stroke="#555" strokeWidth="1" />
      {/* Book stack */}
      <rect x="-24" y="-5" width="8" height="2" fill="#4169E1" rx="0.5" />
      <rect x="-23" y="-7" width="7" height="2" fill="#DC3545" rx="0.5" />
      <rect x="-25" y="-9" width="9" height="2" fill="#28A745" rx="0.5" />
      {/* Lantern */}
      <rect x="-14" y="-8" width="4" height="5" fill="#FFD700" opacity="0.3" rx="1" />
      <rect x="-15" y="-9" width="6" height="2" fill="#888" rx="1" />
      <rect x="-13" y="-6" width="2" height="1" fill="#FFD700" opacity="0.8" />
    </g>
  );
}
