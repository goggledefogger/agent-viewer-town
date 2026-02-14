# Extensible Theme and Asset Infrastructure

## Goals

1. **Per-project backgrounds**: Different GitHub repos can have different visual environments
2. **Modular character composition**: Base animal + accessories + effects as separate layers
3. **Composable background elements**: Trees, buildings, weather as mix-and-match pieces
4. **Clean build performance**: No runtime penalty for unused themes

## Current State

```
packages/client/src/svg/
  animals/        Beaver.tsx, Owl.tsx, Fox.tsx, Bear.tsx, Rabbit.tsx
  effects/        CheckmarkBurst.tsx, DataBlock.tsx, SparkParticles.tsx, SteamPuff.tsx
  environment/    Cloud.tsx, ControlDesk.tsx, DraftingTable.tsx, Flower.tsx,
                  Mushroom.tsx, PineTree.tsx, QualityAnvil.tsx, Stream.tsx,
                  TreehouseLookout.tsx, Workbench.tsx
  machines/       PipeJunction.tsx, PressureGauge.tsx, ValveWheel.tsx
```

All components are inline TSX with no shared constants, no shared color definitions, and no composition system. Each animal is self-contained (good for simplicity, bad for extensibility).

## Proposed Structure

```
packages/client/src/svg/
  themes/
    index.ts                    # Theme registry + active theme resolver
    types.ts                    # ThemeConfig, BackgroundDef, ColorPalette interfaces
    default/
      index.ts                  # Exports the "Workshop in the Woods" theme
      palette.ts                # Named color constants for this theme
      background.tsx            # Sky gradient, ground, stars, trees
      weather.tsx               # (optional) Rain, snow, fog overlays
    cyberpunk/                  # Example future theme
      index.ts
      palette.ts
      background.tsx
  characters/
    types.ts                    # AnimalDef, AccessoryDef interfaces
    registry.ts                 # Maps role/subagentType -> animal component
    animals/
      Beaver.tsx                # (moved from svg/animals/)
      Owl.tsx
      Fox.tsx
      Bear.tsx
      Rabbit.tsx
      Squirrel.tsx              # New subagent animals
      Chipmunk.tsx
      Woodpecker.tsx
      Mouse.tsx
    accessories/
      types.ts                  # Accessory slot definitions (head, held, back)
      HardHat.tsx               # Extracted from Beaver stage 2
      Spectacles.tsx            # Extracted from Owl stage 2
      WeldingGoggles.tsx        # Extracted from Fox stage 3
      MagnifyingGlass.tsx       # Extracted from Bear stage 2
      Compass.tsx               # Extracted from Rabbit stage 2
      WizardHat.tsx             # Extracted from Owl stage 3
      ToolBelt.tsx              # Extracted from Beaver stage 3
      ArmorVest.tsx             # Extracted from Bear stage 3
      BlueprintScroll.tsx       # Extracted from Rabbit stage 3
      Wrench.tsx                # Extracted from Fox stage 2
  effects/                      # (stays mostly the same)
    CheckmarkBurst.tsx
    DataBlock.tsx
    SparkParticles.tsx
    SteamPuff.tsx
  environment/                  # Shared environment pieces
    Cloud.tsx
    PineTree.tsx
    Flower.tsx
    Mushroom.tsx
    Stream.tsx
  machines/                     # (stays the same)
    PipeJunction.tsx
    PressureGauge.tsx
    ValveWheel.tsx
```

## Core Interfaces

### ThemeConfig

```typescript
// svg/themes/types.ts

export interface ThemeConfig {
  id: string;                          // "default", "cyberpunk", etc.
  name: string;                        // Human-readable: "Workshop in the Woods"
  palette: ColorPalette;
  background: React.FC<BackgroundProps>;
  groundY: number;                     // Y coordinate where ground starts (default: 480)
  environmentElements?: EnvironmentPlacement[];
}

export interface ColorPalette {
  sky: [string, string, string];       // Gradient stops (top, mid, bottom)
  ground: string;
  groundAccent: string;
  platform: [string, string];          // Workstation platform colors
  stars: string;
  treeLeaf: [string, string];         // Two shades
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
```

### Character Registry

```typescript
// svg/characters/registry.ts

import type { AgentState } from '@agent-viewer/shared';

export interface CharacterResolution {
  AnimalComponent: React.FC<{ stage: number }>;
  accentColor: string;
  accessories: AccessorySlot[];
}

export function resolveCharacter(agent: AgentState): CharacterResolution {
  if (agent.isSubagent) {
    return resolveSubagent(agent.subagentType);
  }
  return resolveMainAgent(agent.role, getEvolutionStage(agent.tasksCompleted));
}
```

This centralizes the current scattered logic in `AgentCharacter.tsx` lines 24-30 (animal mapping) and lines 162-165 (color + component selection).

### Accessory Composition

```typescript
// svg/characters/accessories/types.ts

export type AccessorySlot = 'head' | 'held_left' | 'held_right' | 'back' | 'chest';

export interface AccessoryDef {
  slot: AccessorySlot;
  component: React.FC;
  /** Transform offset relative to animal center */
  offset: { x: number; y: number };
}
```

This lets us compose characters like:
```tsx
<g>
  <AnimalSvg stage={1} />            {/* Base animal body */}
  {accessories.map(acc => (
    <g key={acc.slot} transform={`translate(${acc.offset.x}, ${acc.offset.y})`}>
      <acc.component />
    </g>
  ))}
</g>
```

## Theme Resolution

### Per-Project Theme Mapping

Themes are resolved via a simple mapping in user configuration, not in the codebase:

```typescript
// Server-side: read from a config file or env
// Client-side: received via WebSocket as part of SessionInfo

interface SessionInfo {
  // ... existing fields ...
  theme?: string;  // "default" | "cyberpunk" | custom theme ID
}
```

The theme config could live in a `.agent-viewer.json` in the project root, or be derived from project characteristics (e.g., language, framework). For v1, just use the default theme -- the infrastructure supports switching later.

### Theme Registry

```typescript
// svg/themes/index.ts

import { defaultTheme } from './default';
import type { ThemeConfig } from './types';

const themes: Record<string, ThemeConfig> = {
  default: defaultTheme,
};

export function getTheme(id?: string): ThemeConfig {
  return themes[id || 'default'] || themes.default;
}
```

## Migration Path

### Phase 1: Extract (no visual changes)
1. Create `themes/types.ts` and `characters/types.ts` with interfaces
2. Create `themes/default/palette.ts` extracting color constants from current components
3. Create `characters/registry.ts` centralizing the animal/color mapping from `AgentCharacter.tsx`
4. Move animal TSX files from `svg/animals/` to `svg/characters/animals/`
5. Update imports in `AgentCharacter.tsx` and `Scene.tsx`

This phase produces zero visual changes. All existing tests should pass unchanged.

### Phase 2: Add subagent animals
1. Create `Squirrel.tsx`, `Chipmunk.tsx`, `Woodpecker.tsx`, `Mouse.tsx`
2. Add subagent entries to the character registry
3. Update `AgentCharacter.tsx` to use the registry

### Phase 3: Extract accessories (optional, future)
1. Extract stage 2/3 accessories from animal components into standalone pieces
2. Compose animals + accessories via the slot system
3. This enables mixing accessories across animals (e.g., any animal can wear a hard hat)

### Phase 4: Background theming (future)
1. Extract the sky gradient, ground, stars, trees from `Scene.tsx` into `themes/default/background.tsx`
2. Create a second theme to validate the system works
3. Wire up theme selection via `SessionInfo.theme`

## Scope Guard

### Do Now
- Character registry (centralize animal/color mapping)
- Subagent animal components
- `themes/types.ts` interfaces

### Do Later
- Accessory extraction (nice but not blocking)
- Background theming (requires server-side config)
- Per-project theme mapping

### Don't Do
- Runtime theme switching with transitions (over-engineered for current needs)
- User-facing theme editor UI (premature)
- Procedural/generative backgrounds (complexity explosion)
- Asset loading from external URLs (security + performance concerns)

## Build Performance

All themes and characters are static TSX imports. No dynamic `import()`, no asset loading at runtime. Tree-shaking eliminates unused themes/animals from the production bundle. The only new bundle cost is the 4 subagent animal components (~2-4KB total uncompressed).

If themes grow large in the future, lazy loading via `React.lazy()` for non-default themes would be straightforward since each theme is a self-contained directory with a single entry point.
