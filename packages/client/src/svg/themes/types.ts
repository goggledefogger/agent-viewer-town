/** Theme system type definitions.
 *  A theme defines the visual environment: sky, ground, colors, and decorations. */

export interface ThemeConfig {
  id: string;
  name: string;
  palette: ColorPalette;
  background: React.FC<BackgroundProps>;
  /** Y coordinate where ground starts (default: 480) */
  groundY: number;
  environmentElements?: EnvironmentPlacement[];
}

export interface ColorPalette {
  /** Sky gradient stops: [top, mid, bottom] */
  sky: [string, string, string];
  ground: string;
  groundAccent: string;
  /** Workstation platform colors: [top, base] */
  platform: [string, string];
  stars: string;
  /** Tree leaf shades: [primary, lighter] */
  treeLeaf: [string, string];
  treeTrunk: string;
}

export interface BackgroundProps {
  width: number;
  height: number;
  palette: ColorPalette;
}

export interface EnvironmentPlacement {
  component: React.FC;
  x: number;
  y: number;
  scale?: number;
  opacity?: number;
}
