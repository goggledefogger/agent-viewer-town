# Subagent Visual Differentiation Strategy

## Problem Statement

All subagents currently render as gray Owls at 80% scale, regardless of their type. This makes it impossible to tell at a glance what a subagent is doing. The `subagentType` field is already populated on `AgentState` with values like `"Explore"`, `"Plan"`, `"Bash"`, and custom names.

## Current State

### Main Agent Animals (keep as-is)
| Role | Animal | Color | Rationale |
|------|--------|-------|-----------|
| Lead | Beaver | Gold #FFD700 | Builder, dam architect = project leader |
| Researcher | Owl | Blue #4169E1 | Wisdom, observation = knowledge gathering |
| Implementer | Fox | Red #DC3545 | Clever, quick = crafty builder |
| Tester | Bear | Green #28A745 | Strong, thorough = quality guardian |
| Planner | Rabbit | White #F8F9FA | Long ears (listening), quick thinker |

**Recommendation: Keep existing main agent animals.** They are well-established, visually distinct, and the role metaphors work. No changes needed.

## Subagent Differentiation Strategy

### Approach: Unique Animals + Color Tinting

Each subagent type gets its own small animal, chosen for visual metaphor. Subagents remain at 80% scale to preserve the parent-child hierarchy. The key differentiators are: **animal silhouette** (primary), **accent color** (secondary), and **optional small accessory** (tertiary).

### Recommended Subagent Animals

| Subagent Type | Animal | Accent Color | Rationale |
|---------------|--------|-------------|-----------|
| **Explore** | Squirrel | Cyan #26C6DA | Squirrels dart around searching for things, perfect for a codebase explorer. Small, quick, always looking. |
| **Plan** | Chipmunk | Amber #FFCA28 | Chipmunks are methodical hoarders that carefully plan their stores. Distinct from Rabbit (planner) by being smaller and rounder. |
| **Bash** | Woodpecker | Orange #FF7043 | Woodpeckers tap-tap-tap against surfaces -- a direct metaphor for running shell commands. Visually distinct with vertical posture. |
| **General-purpose** | Mouse | Slate #94a3b8 | Small, versatile, goes anywhere. The default subagent when type is unspecified or custom. |

### Why These Animals Work

1. **Silhouette distinctiveness**: Each has a unique outline. Squirrel = bushy tail curve. Chipmunk = round body with stripes. Woodpecker = upright + long beak. Mouse = round ears + thin tail. None overlap with the 5 main animals.

2. **Size appropriateness**: All four are naturally smaller than the main animals (beaver, owl, fox, bear, rabbit), reinforcing the subagent hierarchy without needing scale tricks.

3. **Workshop theme fit**: Squirrels, chipmunks, woodpeckers, and mice all belong in a "Workshop in the Woods" setting. They feel like woodland workshop helpers.

4. **Visual metaphor clarity**:
   - Explore Squirrel = "darting through the codebase searching"
   - Plan Chipmunk = "carefully organizing and planning"
   - Bash Woodpecker = "tapping out commands"
   - General Mouse = "small helper doing whatever's needed"

### Color Implementation

Instead of the current flat gray (`#94a3b8`) for all subagents, each type gets an accent color that tints:
- The name label text
- The tether line energy pulse
- The gear indicator when working
- The status line text showing the subagent type

The animal body colors remain naturalistic (browns, grays) to fit the woodland aesthetic. The accent color appears in small highlights:
- Eye shine color
- A tiny scarf/bandana on the animal (optional, stage-independent)
- The working gear indicator

### Accessory Details (Optional Enhancement)

Small accessories reinforce the type at close range. These are simpler than main-agent stage evolutions -- just 2-4 SVG elements each:

| Type | Accessory | SVG Complexity |
|------|-----------|---------------|
| Explore | Tiny magnifying glass (3 elements: circle + line + fill) | ~15 lines |
| Plan | Small clipboard (2 rects + 2 lines) | ~10 lines |
| Bash | Terminal prompt `>_` floating nearby (2 text elements) | ~8 lines |
| General | None (stays clean) | 0 lines |

### What NOT to Do

- **Don't reuse main agent animals for subagents.** Using an Owl for Explore (even with different coloring) creates confusion about whether it's a researcher or a subagent.
- **Don't rely on color alone.** Color-only differentiation fails for colorblind users and is hard to read at small scale.
- **Don't add evolution stages to subagents.** Subagents are ephemeral -- they spawn, work, and despawn. Evolution implies persistence they don't have.
- **Don't overload with accessories.** Subagents are rendered at 80% scale. Complex accessories become visual noise. Keep it to 1 optional accessory max.

## Implementation Notes

### File Structure
```
packages/client/src/svg/animals/
  Beaver.tsx      (existing - lead)
  Owl.tsx         (existing - researcher)
  Fox.tsx         (existing - implementer)
  Bear.tsx        (existing - tester)
  Rabbit.tsx      (existing - planner)
  Squirrel.tsx    (new - Explore subagent)
  Chipmunk.tsx    (new - Plan subagent)
  Woodpecker.tsx  (new - Bash subagent)
  Mouse.tsx       (new - general subagent)
```

### AgentCharacter.tsx Changes

Replace the current subagent logic:
```tsx
// CURRENT (line 165):
const AnimalSvg = agent.isSubagent ? Owl : (ANIMAL_COMPONENTS[agent.role] || Beaver);

// PROPOSED:
const SUBAGENT_ANIMALS: Record<string, React.FC<{ stage: number }>> = {
  'Explore': Squirrel,
  'Plan': Chipmunk,
  'Bash': Woodpecker,
};
const AnimalSvg = agent.isSubagent
  ? (SUBAGENT_ANIMALS[agent.subagentType || ''] || Mouse)
  : (ANIMAL_COMPONENTS[agent.role] || Beaver);
```

Replace the flat gray color:
```tsx
// CURRENT (line 162):
const color = agent.isSubagent ? '#94a3b8' : (ROLE_COLORS[agent.role] || '#FFD700');

// PROPOSED:
const SUBAGENT_COLORS: Record<string, string> = {
  'Explore': '#26C6DA',
  'Plan': '#FFCA28',
  'Bash': '#FF7043',
};
const color = agent.isSubagent
  ? (SUBAGENT_COLORS[agent.subagentType || ''] || '#94a3b8')
  : (ROLE_COLORS[agent.role] || '#FFD700');
```

### SVG Complexity Budget

Each new animal component should target ~30-50 lines of SVG (similar to existing animals without evolution stages). The existing animals range from 35 lines (Rabbit base) to 60 lines (Bear base). Subagent animals should be on the simpler end since they render at 80% scale.

### Pixel Art Style Guide for New Animals

Match existing conventions:
- Body shapes: `<rect>` with `rx` for rounded corners, `<ellipse>` for organic shapes
- Eyes: 3x3px dark squares with 1x1px white shine
- Colors: 2-3 shades per body area (base, belly/highlight, dark accents)
- No outlines/strokes on body parts (fill only, like existing animals)
- Feet: small `<rect>` elements at bottom
- Total vertical extent: roughly -24px to +17px (fits within the platform)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| New animals look out of style | Follow existing SVG patterns exactly; review against Beaver/Fox side by side |
| Too many visual elements on screen | Subagents already at 80% scale; accessories are optional and can be omitted in v1 |
| Unknown subagent types | Fall back to Mouse (general-purpose) for any unrecognized `subagentType` |
| Performance with many subagents | SVG elements are lightweight; 4 extra components = negligible bundle impact |
