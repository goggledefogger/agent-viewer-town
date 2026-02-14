# Creative Ideas: Visual Features for Agent Viewer Town

## Overview

These are 7 visual features ranked by impact-to-effort ratio. Each is scoped to 1 day of work or less. Ideas are grounded in the existing "Workshop in the Woods" pixel-art theme.

---

## 1. Context-Aware Tool Animations (HIGH impact, MEDIUM effort)

**What**: When an agent uses a specific tool, show a brief tool-specific animation at their workstation instead of the generic steam puffs.

| Tool | Animation |
|------|-----------|
| Read / Glob / Grep | Pages flipping (small rectangles fanning out) |
| Edit / Write | Pencil scratching (tiny line being drawn) |
| Bash | Terminal cursor blinking with `>_` prompt |
| WebSearch / WebFetch | Satellite dish pulsing |
| SendMessage | Envelope flying toward recipient |
| TaskCreate / TaskUpdate | Clipboard with checkmark appearing |

**Why**: The current steam puffs are the same for every action. Tool-specific animations give "at a glance" understanding of what type of work is happening without reading the action bubble text.

**Implementation**: Add a `toolCategory` field derived from `currentAction` in the server. Map categories to small SVG animation components. Show for 2-3 seconds, then revert to steam puffs.

**Effort**: ~6 hours (6-8 small animation components + mapping logic)

**Scope guard**: Don't animate every single tool name. Group into 5-6 categories max. The animation components should be 10-15 SVG lines each, not elaborate.

---

## 2. Day/Night Cycle Tied to Real Time (HIGH impact, LOW effort)

**What**: The sky gradient shifts based on the user's local time of day. Dawn (6-8am) = warm oranges. Day (8am-6pm) = current blue. Dusk (6-8pm) = purples/pinks. Night (8pm-6am) = deeper blues with more visible stars.

**Why**: Makes the scene feel alive and connected to the real world. Developers working late see a night sky; morning committers see dawn. It's ambient and doesn't distract from the functional display.

**Implementation**: Interpolate the 3 sky gradient stops based on `new Date().getHours()`. Update the star opacity. Add a moon element for nighttime. The ground color can shift slightly warmer/cooler too.

**Effort**: ~3 hours (gradient math + 4 time-of-day palette presets + moon SVG)

**Scope guard**: Do NOT add actual sunrise/sunset animations or moving sun/moon. Just a static palette shift checked once per minute.

---

## 3. Smoke Stack Activity Meter (MEDIUM impact, LOW effort)

**What**: A workshop chimney in the background corner that emits more or less smoke based on total team activity. 0 agents working = no smoke. 1-2 working = thin wisps. 3+ working = thick billowing smoke. All idle = chimney visible but cold.

**Why**: Gives a single at-a-glance indicator of "how busy is the team right now" without counting individual agents. It's a natural workshop element.

**Implementation**: Count agents with `status === 'working'`. Render a chimney (a few `<rect>` elements) in the background. Vary the number and size of smoke `<circle>` particles using existing `SteamPuffs` animation patterns.

**Effort**: ~2 hours (chimney SVG + parameterized smoke)

**Scope guard**: The chimney is background decoration. Don't make it interactive or clickable.

---

## 4. Progress Trail Footprints (MEDIUM impact, MEDIUM effort)

**What**: As an agent completes tasks, small footprint marks accumulate on the ground near their workstation, forming a trail. The trail color matches the agent's branch color. When a session ends, the footprints fade.

**Why**: Gives a persistent sense of progress and accomplishment. You can glance at the ground and see which agents have been most productive. It's a satisfying visual that grows over time.

**Implementation**: Track `tasksCompleted` per agent. For each increment, add a pair of small `<rect>` footprints (2x3px) near the agent's platform, offset slightly each time. Cap at ~8 pairs to avoid clutter. Use CSS opacity animation for appearance.

**Effort**: ~4 hours (footprint placement logic + SVG + fade animations)

**Scope guard**: Cap the footprint count. Don't try to path-find or create actual walking paths -- just scatter them near the workstation.

---

## 5. Weather Effects for Project Health (MEDIUM impact, MEDIUM effort)

**What**: Gentle environmental effects that reflect project state:
- **Sunny** (clear): All tasks progressing, no blockers
- **Light rain**: 1+ tasks blocked / agents waiting for input
- **Snow/frost**: Session has been idle for 10+ minutes
- **Rainbows**: A milestone is hit (e.g., all tasks completed)

**Why**: Ambient storytelling. Instead of scanning each agent individually, the weather tells you the overall project mood. Weather is a natural fit for the outdoor workshop theme.

**Implementation**: Compute a "health score" from task/agent state. Render weather as a translucent overlay layer: rain = animated `<line>` elements falling, snow = slow `<circle>` elements drifting, rainbow = multi-color arc.

**Effort**: ~6 hours (health scoring + 3-4 weather overlay components)

**Scope guard**: Keep overlays subtle (low opacity, thin elements). Weather must NOT obscure agent bubbles or labels. Don't add thunder, lightning, or complex particle systems.

---

## 6. Message Carrier Pigeons (LOW impact, HIGH delight)

**What**: When agents send messages to each other (via `SendMessage`), a tiny pixel-art pigeon flies from sender to recipient carrying a small envelope. The pigeon follows the tether curve path.

**Why**: Pure delight factor. Messages are an important team coordination event, and the pigeon makes it memorable and fun to watch. It leverages the existing tether path geometry (the `Q` curve in `Scene.tsx` line 588).

**Implementation**: Create a small pigeon SVG (~15 lines, 8x6px body). On `new_message` events, spawn a pigeon that `<animateMotion>` follows the tether path from sender position to recipient position over ~2 seconds, then disappears.

**Effort**: ~4 hours (pigeon SVG + message event listener + animateMotion wiring)

**Scope guard**: One pigeon per message, no flocking behavior. Pigeon despawns after arrival. Don't queue multiple pigeons -- if messages are rapid, just show the latest.

---

## 7. Workstation Personality (LOW impact, LOW effort)

**What**: Each agent's workstation platform gets a small decorative element that reflects their role:
- Lead (Beaver): Small flag/pennant on the platform
- Researcher (Owl): Stack of books
- Implementer (Fox): Scattered gears
- Tester (Bear): Checkmark clipboard
- Planner (Rabbit): Rolled-up blueprint

**Why**: Adds character and visual richness to the currently plain wooden platforms. Makes each workstation feel "owned" by its agent. Low effort because these are just 3-5 SVG elements each, rendered statically.

**Implementation**: Add a `<g>` element inside `AgentCharacter.tsx` after the platform rendering (around line 188-190). Conditionally render the decoration based on `agent.role`.

**Effort**: ~2 hours (5 small decorative SVG groups, ~5 lines each)

**Scope guard**: Static decoration only. Don't animate these. Don't add to subagent workstations.

---

## Priority Matrix

| # | Idea | Impact | Effort | Priority |
|---|------|--------|--------|----------|
| 1 | Context-aware tool animations | High | 6h | **P1** |
| 2 | Day/night cycle | High | 3h | **P1** |
| 3 | Smoke stack activity meter | Medium | 2h | **P2** |
| 7 | Workstation personality | Low | 2h | **P2** |
| 4 | Progress trail footprints | Medium | 4h | **P3** |
| 6 | Message carrier pigeons | Low | 4h | **P3** |
| 5 | Weather effects | Medium | 6h | **P4** |

**Recommended order**: Start with #2 (day/night cycle, quick win), then #3 (smoke stack, also quick), then #1 (tool animations, highest impact but more work), then #7 (workstation personality, easy polish).

Ideas #4, #5, #6 are fun but lower priority. They can be deferred to a future sprint without loss.

---

## Ideas Considered and Rejected

These came up during brainstorming but were flagged as too complex or out of scope:

- **3D perspective shift**: Isometric view instead of flat side-view. Rejected: would require rewriting every SVG component. Multi-week effort.
- **Agent walking animations**: Agents physically walk between workstations. Rejected: Complex path-finding, animation state machines. Not worth it for a monitoring tool.
- **Sound effects**: Audio cues for events. Rejected: Annoying in a background monitoring tool. Users would mute immediately.
- **Git commit tree visualization**: Render an actual git graph in the background. Rejected: Belongs in a dedicated git UI, not a monitoring dashboard. Competes visually with agents.
- **Interactive drag-and-drop**: Let users rearrange agent positions. Rejected: Positions are computed from role/layout. Custom positions would need persistence and conflict with dynamic layouts.
