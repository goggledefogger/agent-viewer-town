interface Props {
  color?: string;
  /** 0 to 1 pressure level */
  level?: number;
}

/** Pressure gauge dial */
export function PressureGauge({ color = '#28A745', level = 0.5 }: Props) {
  // Needle angle: -120 deg (0) to +120 deg (1)
  const angle = -120 + level * 240;
  const needleX = Math.cos((angle - 90) * Math.PI / 180) * 6;
  const needleY = Math.sin((angle - 90) * Math.PI / 180) * 6;
  const fillColor = level > 0.8 ? '#DC3545' : level > 0.5 ? '#FFD700' : color;

  return (
    <g>
      {/* Gauge body */}
      <circle cx="0" cy="0" r="10" fill="#1e293b" stroke="#334155" strokeWidth="2" />
      {/* Gauge face */}
      <circle cx="0" cy="0" r="8" fill="#16213e" />
      {/* Scale markings */}
      {[...Array(7)].map((_, i) => {
        const a = (-120 + i * 40 - 90) * Math.PI / 180;
        const x1 = Math.cos(a) * 6.5;
        const y1 = Math.sin(a) * 6.5;
        const x2 = Math.cos(a) * 8;
        const y2 = Math.sin(a) * 8;
        return (
          <line
            key={i}
            x1={x1} y1={y1}
            x2={x2} y2={y2}
            stroke="#555"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Danger zone arc (top right area) */}
      <path
        d="M 4,-6.9 A 8 8 0 0 1 6.9,4"
        fill="none"
        stroke="#DC3545"
        strokeWidth="1"
        opacity="0.4"
      />
      {/* Needle */}
      <line x1="0" y1="0" x2={needleX} y2={needleY} stroke={fillColor} strokeWidth="1" />
      {/* Center cap */}
      <circle cx="0" cy="0" r="1.5" fill="#555" />
      {/* Glass reflection */}
      <rect x="-3" y="-6" width="2" height="2" fill="#F8F9FA" opacity="0.08" rx="1" />
    </g>
  );
}
