/** Beaver (lead) workstation: control desk with levers and monitors */
export function ControlDesk() {
  return (
    <g>
      {/* Desk surface */}
      <rect x="-32" y="4" width="64" height="6" fill="#5a4a3a" rx="1" />
      <rect x="-30" y="6" width="60" height="4" fill="#4a3a2a" />
      {/* Desk legs */}
      <rect x="-28" y="10" width="4" height="14" fill="#4a3a2a" />
      <rect x="24" y="10" width="4" height="14" fill="#4a3a2a" />
      {/* Left monitor */}
      <rect x="-26" y="-14" width="18" height="14" fill="#1a1a2e" rx="1" stroke="#FFD700" strokeWidth="0.5" />
      <rect x="-24" y="-12" width="14" height="10" fill="#16213e" />
      {/* Monitor screen lines */}
      <rect x="-22" y="-10" width="8" height="1" fill="#FFD700" opacity="0.6" />
      <rect x="-22" y="-8" width="10" height="1" fill="#FFD700" opacity="0.4" />
      <rect x="-22" y="-6" width="6" height="1" fill="#28A745" opacity="0.5" />
      {/* Monitor stand */}
      <rect x="-19" y="0" width="4" height="4" fill="#333" />
      {/* Right monitor */}
      <rect x="8" y="-14" width="18" height="14" fill="#1a1a2e" rx="1" stroke="#FFD700" strokeWidth="0.5" />
      <rect x="10" y="-12" width="14" height="10" fill="#16213e" />
      {/* Monitor graph display */}
      <polyline points="12,-10 14,-6 16,-8 18,-4 20,-7 22,-5" fill="none" stroke="#28A745" strokeWidth="0.8" />
      {/* Monitor stand */}
      <rect x="15" y="0" width="4" height="4" fill="#333" />
      {/* Lever left */}
      <rect x="-6" y="-2" width="2" height="6" fill="#888" />
      <circle cx="-5" cy="-3" r="2" fill="#DC3545" />
      {/* Lever right */}
      <rect x="4" y="0" width="2" height="4" fill="#888" />
      <circle cx="5" cy="-1" r="2" fill="#28A745" />
      {/* Center button panel */}
      <rect x="-3" y="5" width="6" height="4" fill="#333" rx="1" />
      <rect x="-2" y="6" width="2" height="2" fill="#DC3545" rx="1" />
      <rect x="1" y="6" width="2" height="2" fill="#FFD700" rx="1" />
    </g>
  );
}
