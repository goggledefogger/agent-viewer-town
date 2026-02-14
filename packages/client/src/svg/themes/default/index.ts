import type { ThemeConfig } from '../types';
import { defaultPalette } from './palette';
import { DefaultBackground } from './background';

export const defaultTheme: ThemeConfig = {
  id: 'default',
  name: 'Workshop in the Woods',
  palette: defaultPalette,
  background: DefaultBackground,
  groundY: 480,
};
