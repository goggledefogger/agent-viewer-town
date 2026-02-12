/** Fox (implementer) workstation: workbench with tools */
export function Workbench() {
  return (
    <g>
      {/* Bench surface */}
      <rect x="-32" y="4" width="64" height="5" fill="#7a5a3a" rx="1" />
      <rect x="-30" y="6" width="60" height="3" fill="#6a4a2a" />
      {/* Bench legs */}
      <rect x="-28" y="9" width="4" height="16" fill="#5a3a1a" />
      <rect x="24" y="9" width="4" height="16" fill="#5a3a1a" />
      {/* Cross brace */}
      <line x1="-24" y1="20" x2="24" y2="14" stroke="#5a3a1a" strokeWidth="2" />
      {/* Vice grip */}
      <rect x="-30" y="-2" width="6" height="6" fill="#888" rx="1" />
      <rect x="-32" y="-1" width="2" height="4" fill="#666" />
      <rect x="-26" y="-1" width="2" height="4" fill="#666" />
      <rect x="-34" y="0" width="3" height="2" fill="#555" rx="1" />
      {/* Hammer */}
      <g transform="translate(4, -2)">
        <rect x="0" y="0" width="2" height="8" fill="#8B6914" />
        <rect x="-3" y="-2" width="8" height="4" fill="#888" rx="1" />
      </g>
      {/* Screwdriver */}
      <g transform="translate(14, -4) rotate(15)">
        <rect x="0" y="0" width="2" height="10" fill="#DC3545" />
        <rect x="-0.5" y="10" width="3" height="4" fill="#888" />
      </g>
      {/* Small gear on bench */}
      <circle cx="-16" cy="2" r="3" fill="none" stroke="#888" strokeWidth="1" />
      <circle cx="-16" cy="2" r="1" fill="#888" />
      {/* Nails / screws scattered */}
      <rect x="20" y="2" width="1" height="3" fill="#aaa" />
      <rect x="23" y="3" width="1" height="2" fill="#aaa" />
      <rect x="18" y="3" width="1" height="2" fill="#aaa" />
      {/* Pegboard back panel */}
      <rect x="-28" y="-14" width="56" height="12" fill="#5a4a3a" rx="1" />
      {/* Tool hooks on pegboard */}
      <rect x="-20" y="-12" width="1" height="4" fill="#888" />
      <rect x="-10" y="-12" width="1" height="3" fill="#888" />
      <rect x="0" y="-12" width="1" height="5" fill="#888" />
      <rect x="10" y="-12" width="1" height="3" fill="#888" />
      <rect x="20" y="-12" width="1" height="4" fill="#888" />
    </g>
  );
}
