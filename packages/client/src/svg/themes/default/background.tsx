import type { BackgroundProps } from '../types';

/** Default "Workshop in the Woods" background — sky gradient, ground, stars, and trees.
 *  Extracted from Scene.tsx to enable per-theme background swapping. */
export function DefaultBackground({ width, height, palette }: BackgroundProps) {
  return (
    <g>
      {/* Sky gradient */}
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sky[0]} />
          <stop offset="60%" stopColor={palette.sky[1]} />
          <stop offset="100%" stopColor={palette.sky[2]} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="url(#skyGrad)" />

      {/* Ground */}
      <rect x="0" y="480" width={width} height="120" fill={palette.ground} />
      <rect x="0" y="480" width={width} height="4" fill={palette.groundAccent} />

      {/* Trees (background decoration) */}
      <g opacity="0.6">
        {[50, 150, 780, 860].map((tx, i) => (
          <g key={i} transform={`translate(${tx}, 440)`}>
            <rect x="-4" y="0" width="8" height="40" fill={palette.treeTrunk} />
            <polygon points="-20,-5 0,-40 20,-5" fill={palette.treeLeaf[0]} />
            <polygon points="-15,-20 0,-50 15,-20" fill={palette.treeLeaf[1]} />
          </g>
        ))}
      </g>

      {/* Stars */}
      {[
        [80, 40], [200, 60], [340, 30], [500, 50], [650, 35], [780, 55],
        [120, 90], [400, 80], [600, 70], [720, 45],
      ].map(([sx, sy], i) => (
        <rect key={i} x={sx} y={sy} width="2" height="2" fill={palette.stars} opacity={0.4 + (i % 3) * 0.2} />
      ))}
    </g>
  );
}
