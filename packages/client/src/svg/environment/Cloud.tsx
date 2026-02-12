interface Props {
  variant?: number;
}

/** Pixel-art cloud */
export function Cloud({ variant = 0 }: Props) {
  const opacity = 0.15 + (variant % 3) * 0.05;
  const scale = 0.8 + (variant % 3) * 0.2;

  return (
    <g opacity={opacity} transform={`scale(${scale})`}>
      {/* Cloud body using overlapping rounded rects for pixel feel */}
      <rect x="-12" y="-2" width="24" height="8" fill="#F8F9FA" rx="3" />
      <rect x="-8" y="-6" width="16" height="8" fill="#F8F9FA" rx="3" />
      <rect x="-4" y="-8" width="10" height="6" fill="#F8F9FA" rx="2" />
      {/* Highlight */}
      <rect x="-6" y="-5" width="8" height="2" fill="#ffffff" rx="1" opacity="0.5" />
    </g>
  );
}
