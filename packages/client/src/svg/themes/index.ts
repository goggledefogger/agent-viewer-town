import { defaultTheme } from './default';
import type { ThemeConfig } from './types';

export type { ThemeConfig, ColorPalette, BackgroundProps, EnvironmentPlacement } from './types';

const themes: Record<string, ThemeConfig> = {
  default: defaultTheme,
};

export function getTheme(id?: string): ThemeConfig {
  return themes[id || 'default'] || themes.default;
}
