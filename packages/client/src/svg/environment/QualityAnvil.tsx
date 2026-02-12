/** Bear (tester) workstation: quality control anvil with magnifying glass */
export function QualityAnvil() {
  return (
    <g>
      {/* Anvil base */}
      <rect x="-14" y="10" width="28" height="6" fill="#555" rx="1" />
      {/* Anvil body */}
      <rect x="-10" y="2" width="20" height="10" fill="#666" rx="1" />
      {/* Anvil horn */}
      <polygon points="-10,4 -18,6 -10,8" fill="#555" />
      {/* Anvil top face */}
      <rect x="-12" y="0" width="24" height="4" fill="#777" rx="1" />
      {/* Anvil highlight */}
      <rect x="-10" y="1" width="20" height="1" fill="#888" />
      {/* Large magnifying glass */}
      <g transform="translate(20, -10)">
        <circle cx="0" cy="0" r="8" fill="none" stroke="#28A745" strokeWidth="2" />
        <circle cx="0" cy="0" r="6" fill="rgba(40, 167, 69, 0.08)" />
        <line x1="5" y1="5" x2="12" y2="12" stroke="#28A745" strokeWidth="2.5" />
        {/* Glass shine */}
        <rect x="-3" y="-4" width="2" height="2" fill="#28A745" opacity="0.2" rx="1" />
      </g>
      {/* Checklist clipboard */}
      <g transform="translate(-26, -6)">
        <rect x="0" y="0" width="10" height="14" fill="#F8F9FA" rx="1" />
        <rect x="2" y="-2" width="6" height="3" fill="#888" rx="1" />
        {/* Check marks */}
        <polyline points="2,4 3,5 5,3" fill="none" stroke="#28A745" strokeWidth="0.8" />
        <polyline points="2,7 3,8 5,6" fill="none" stroke="#28A745" strokeWidth="0.8" />
        <polyline points="2,10 3,11 5,9" fill="none" stroke="#28A745" strokeWidth="0.8" />
        {/* Lines next to checks */}
        <rect x="6" y="3.5" width="3" height="1" fill="#888" opacity="0.5" />
        <rect x="6" y="6.5" width="3" height="1" fill="#888" opacity="0.5" />
        <rect x="6" y="9.5" width="3" height="1" fill="#888" opacity="0.5" />
      </g>
      {/* Stump / platform for the anvil */}
      <rect x="-16" y="16" width="32" height="8" fill="#5a3a1a" rx="2" />
      <rect x="-14" y="17" width="28" height="2" fill="#4a2a0a" opacity="0.3" />
    </g>
  );
}
