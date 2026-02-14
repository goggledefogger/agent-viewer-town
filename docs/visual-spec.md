# Visual Design Spec: Hierarchical Navigation, Tasks, and Inbox

## Design Principles

1. **Pixel art aesthetic**: All new elements use rectangular, blocky shapes consistent with existing SVG animal characters, gears, and LEGO-packet data flow.
2. **Dark-sky palette**: Reuse the deep-navy-to-indigo sky gradient (#1a1a2e / #16213e / #0f3460) as the panel background. Gold (#FFD700) for emphasis, muted slate (#94a3b8) for secondary text.
3. **Monospace everywhere**: `'Courier New', monospace` at small sizes (7-12px for SVG, 10-14px for HTML).
4. **Minimal footprint in SVG**: Task indicators in the scene must be tiny (< 20px) so they don't compete with animal characters or action bubbles.
5. **Consistent with existing interactions**: Click-to-expand pattern (like AgentDetail popover), smooth CSS transitions, same animation timings.

---

## 1. Color Palette Extensions

New semantic colors added alongside existing palette:

```
/* Task status — already defined as CSS vars, reuse: */
--color-pending:     #6C757D   /* gray */
--color-in-progress: #4169E1   /* royal blue */
--color-completed:   #28A745   /* green */

/* NEW — notification priority */
--color-notif-urgent:  #DC3545   /* red — same as --color-red */
--color-notif-warning: #FFCA28   /* amber */
--color-notif-info:    #4169E1   /* blue — same as --color-blue */
--color-notif-success: #28A745   /* green — same as --color-green */

/* NEW — navigation chrome */
--color-nav-active:    #FFD700   /* gold highlight for active item */
--color-nav-hover:     rgba(65, 105, 225, 0.12)   /* blue tint */
--color-nav-indent:    #334155   /* subtle indent guide color */
--color-zoom-btn-bg:   #16213e   /* button background */
--color-zoom-btn-border: #334155 /* button border */
```

These all derive from the existing 8-bit palette. No new "base" colors are introduced — only new semantic uses of existing colors.

---

## 2. Task Cards in SVG Scene

### Style: "Workshop Clipboard"

Each task shows as a small clipboard/ticket pinned near the agent working on it. Designed to evoke a workshop job ticket nailed to a workbench.

### Anatomy (18px wide x 22px tall)

```
 ┌──────┐  <- clip: 2px tall, gold-colored (#FFD700)
 │ #3   │  <- task ID, 6px font, white
 │ ●    │  <- status dot (color-coded)
 └──────┘  <- background: #16213e, border: status color
```

### Status colors:
- **Pending**: border #6C757D, dot #6C757D
- **In progress**: border #4169E1, dot #4169E1 (pulsing opacity)
- **Completed**: border #28A745, dot #28A745, checkmark instead of dot

### Placement:
- Positioned at agent's platform level, offset to the right: `(agentX + 35, agentY + 12)`
- Multiple tasks stack vertically with 4px gap
- Max 3 visible; overflow shows "+N" count

### SVG structure:
```svg
<g transform="translate(agentX+35, agentY+12)">
  <!-- Clipboard background -->
  <rect x="0" y="0" width="18" height="22" rx="2"
        fill="#16213e" stroke="#4169E1" stroke-width="1" />
  <!-- Clip at top -->
  <rect x="5" y="-2" width="8" height="4" rx="1"
        fill="#FFD700" />
  <!-- Task ID -->
  <text x="9" y="10" text-anchor="middle" fill="#e2e8f0"
        font-size="6" font-family="'Courier New', monospace">#3</text>
  <!-- Status indicator -->
  <circle cx="9" cy="16" r="2" fill="#4169E1">
    <animate attributeName="opacity" values="0.5;1;0.5"
             dur="1.5s" repeatCount="indefinite" />
  </circle>
</g>
```

### Interaction:
- Click opens task detail popover (reuses existing AgentDetail pattern)
- Hover: subtle glow (box-shadow equivalent via SVG filter)

---

## 3. Connection Lines (Agent-to-Task)

### Style: Thin dashed lines (consistent with existing branch tethers)

```
Stroke: task status color
Width: 1px
Dash: "2 4" (same as branch tethers)
Opacity: 0.25 idle, 0.5 when task is in_progress
```

When a task is in_progress, the line gets the same `conveyor-move` animation as pipe connections, creating visual flow from agent to task ticket.

These are simple horizontal lines from agent platform edge to task card position. No curves needed (they're close together).

---

## 4. Inbox / Notifications Tab

### Tab visual style:
Reuse existing `.sidebar-tab` pattern. The Inbox tab gets a bell icon (pixel art style, built with CSS box-shadow pixel technique or inline SVG).

### Notification badge (unread count):
```css
.inbox-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  background: #DC3545;          /* --color-red */
  color: #F8F9FA;
  font-size: 9px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  font-family: 'Courier New', monospace;
  border: 1px solid #16213e;    /* panel bg for "cutout" effect */
}
```

### Notification card anatomy:
```
┌─────────────────────────────────┐
│ [icon] Title text          3m   │  <- priority-colored left border
│ Description / details text      │
│ Agent: fox-impl  Task: #3       │  <- meta row, dim text
└─────────────────────────────────┘
```

```css
.notif-card {
  background: var(--color-card-bg);         /* #0f3460 */
  border: 1px solid var(--color-border);    /* #334155 */
  border-left: 3px solid;                   /* priority color */
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 6px;
  font-size: 12px;
  transition: background 0.2s, border-color 0.2s;
}
.notif-card:hover {
  background: rgba(65, 105, 225, 0.08);
}
.notif-card.unread {
  background: rgba(65, 105, 225, 0.06);
}
.notif-card.urgent { border-left-color: #DC3545; }
.notif-card.warning { border-left-color: #FFCA28; }
.notif-card.info { border-left-color: #4169E1; }
.notif-card.success { border-left-color: #28A745; }
```

### Priority icons (pixel art inline SVG, 10x10):

**Urgent (!)**: Red exclamation block
```svg
<svg width="10" height="10" viewBox="0 0 10 10">
  <rect x="4" y="1" width="2" height="5" fill="#DC3545"/>
  <rect x="4" y="7" width="2" height="2" fill="#DC3545"/>
</svg>
```

**Warning (triangle)**: Amber triangle
```svg
<svg width="10" height="10" viewBox="0 0 10 10">
  <polygon points="5,1 9,9 1,9" fill="none" stroke="#FFCA28" stroke-width="1"/>
  <rect x="4" y="4" width="2" height="3" fill="#FFCA28"/>
  <rect x="4" y="8" width="2" height="1" fill="#FFCA28"/>
</svg>
```

**Info (i)**: Blue info block
```svg
<svg width="10" height="10" viewBox="0 0 10 10">
  <rect x="3" y="2" width="4" height="6" rx="1" fill="none" stroke="#4169E1" stroke-width="1"/>
  <rect x="4" y="4" width="2" height="3" fill="#4169E1"/>
  <rect x="4" y="2" width="2" height="1" fill="#4169E1"/>
</svg>
```

**Success (check)**: Green checkmark
```svg
<svg width="10" height="10" viewBox="0 0 10 10">
  <path d="M2,5 L4,7 L8,3" stroke="#28A745" stroke-width="2" fill="none" stroke-linecap="square"/>
</svg>
```

### Notification types (mapped from `NotificationType` in data model):

| NotificationType (data model) | Icon | Left border | Priority | Example |
|------|------|-------------|----------|---------|
| `permission_request` | urgent (!) | red #DC3545 | high | "fox-impl needs approval for Bash" |
| `ask_user_question` | urgent (!) | red #DC3545 | high | "researcher is asking a question" |
| `plan_approval` | warning (triangle) | amber #FFCA28 | medium | "implementer wants plan approval" |
| `task_completed` | success (check) | green #28A745 | low | "Task #3 completed by researcher" |
| `agent_error` | urgent (!) | red #DC3545 | high | "API error on agent researcher" |
| `agent_idle` | warning (triangle) | amber #FFCA28 | medium | "tester has been idle for 5m" |
| `agent_stopped` | info (i) | blue #4169E1 | low | "researcher session ended" |

### Data model integration notes:
- `InboxNotification.type` maps to icon + border color per table above
- `InboxNotification.read` controls: unread = blue dot + subtle bg highlight; read = no dot, transparent bg
- `InboxNotification.resolved` controls: resolved = dimmed text opacity (0.6), strikethrough on title
- `InboxState.unreadCount` drives the badge on the Inbox tab
- `ProjectGroup.unreadNotifications` / `BranchGroup.unreadNotifications` drive badges on tree nodes
- Filter tabs: [All] [Active] [Permission] [Questions] [Tasks] (from data model spec)

---

## 5. Hierarchical Navigation Visuals

### Tree indentation and expand/collapse

The navigation tree uses a left sidebar or replaces the session picker dropdown. Each level is indented 16px with a vertical indent guide line.

### Expand/collapse icons (pixel art, 8x8):

**Collapsed (right arrow):**
```svg
<svg width="8" height="8" viewBox="0 0 8 8">
  <polygon points="2,1 6,4 2,7" fill="#94a3b8"/>
</svg>
```

**Expanded (down arrow):**
```svg
<svg width="8" height="8" viewBox="0 0 8 8">
  <polygon points="1,2 7,2 4,6" fill="#e2e8f0"/>
</svg>
```

When expanded, the icon color brightens from dim (#94a3b8) to light (#e2e8f0) to indicate active/open state.

### Tree node styles:

```css
.nav-tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  padding-left: calc(8px + var(--indent-level) * 16px);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text);
  transition: background 0.15s;
  position: relative;
}
.nav-tree-node:hover {
  background: var(--color-nav-hover);       /* rgba(65, 105, 225, 0.12) */
}
.nav-tree-node.active {
  background: rgba(255, 215, 0, 0.1);
  color: var(--color-gold);
}

/* Vertical indent guide lines */
.nav-tree-node::before {
  content: '';
  position: absolute;
  left: calc(var(--indent-level) * 16px + 4px);
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-nav-indent);      /* #334155 */
}
```

### Tree hierarchy example:
```
[-] agent-viewer-town              (project)
    [-] main                       (branch)
        [*] session-abc123         (active session, gold dot)
    [+] feature/navigation         (branch, collapsed)
    [+] fix/watcher-bug            (branch, collapsed)
```

Level indicators:
- **Project level**: Gold text, no indent
- **Branch level**: Branch color (from getBranchColor), 1 indent
- **Session level**: White text, status dot (green=active, gray=idle), 2 indents

### Active state indicator:
A 2px gold left-border on the active node, plus gold text color.

---

## 6. Zoom Controls

### Button style: Workshop tool buttons

Small square buttons (28x28px) with pixel-art style icons, placed in the bottom-right corner of the SVG scene (or as an overlay).

```css
.zoom-controls {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 5;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-zoom-btn-bg);    /* #16213e */
  border: 1px solid var(--color-zoom-btn-border);  /* #334155 */
  border-radius: 4px;
  color: var(--color-text-dim);            /* #94a3b8 */
  font-size: 14px;
  font-family: 'Courier New', monospace;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.zoom-btn:hover {
  background: rgba(65, 105, 225, 0.15);
  color: var(--color-text);
  border-color: var(--color-blue);
}
.zoom-btn:active {
  background: rgba(65, 105, 225, 0.25);
}
```

### Zoom icons (pixel art, inline SVG 12x12):

**Zoom In (+):**
```svg
<svg width="12" height="12" viewBox="0 0 12 12">
  <rect x="5" y="2" width="2" height="8" fill="currentColor"/>
  <rect x="2" y="5" width="8" height="2" fill="currentColor"/>
</svg>
```

**Zoom Out (-):**
```svg
<svg width="12" height="12" viewBox="0 0 12 12">
  <rect x="2" y="5" width="8" height="2" fill="currentColor"/>
</svg>
```

**Fit/Reset (box with arrows):**
```svg
<svg width="12" height="12" viewBox="0 0 12 12">
  <rect x="1" y="1" width="10" height="10" fill="none"
        stroke="currentColor" stroke-width="1"/>
  <rect x="4" y="4" width="4" height="4" fill="currentColor" opacity="0.4"/>
</svg>
```

**Zoom to Agent (crosshair):**
```svg
<svg width="12" height="12" viewBox="0 0 12 12">
  <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1"/>
  <rect x="5" y="0" width="2" height="3" fill="currentColor"/>
  <rect x="5" y="9" width="2" height="3" fill="currentColor"/>
  <rect x="0" y="5" width="3" height="2" fill="currentColor"/>
  <rect x="9" y="5" width="3" height="2" fill="currentColor"/>
</svg>
```

### Button layout (bottom-right overlay):
```
 [+]     <- zoom in
 [-]     <- zoom out
 [□]     <- fit all
 [⊕]     <- zoom to selected agent
```

---

## 7. Breadcrumb Navigation Bar

As an alternative/complement to the tree, a breadcrumb strip in the header shows the current zoom level:

```
Project > Branch > Session
```

Each segment is clickable to zoom out to that level.

```css
.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: 'Courier New', monospace;
}
.breadcrumb-segment {
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 2px;
  transition: color 0.15s, background 0.15s;
}
.breadcrumb-segment:hover {
  color: var(--color-text);
  background: var(--color-nav-hover);
}
.breadcrumb-segment.current {
  color: var(--color-gold);
  font-weight: bold;
}
.breadcrumb-separator {
  color: var(--color-border);
  font-size: 9px;
}
```

---

## 8. Integration Summary

### How new elements fit with existing scene:

```
┌─────────────────────────────────────────────────────┐
│ [header: team name | breadcrumbs | stats | ■ inbox] │
├───────────────────────────────────┬──────────────────┤
│                                   │ [sidebar tabs]   │
│   ★    ★         ★    ★          │ Scene | Tasks |   │
│                                   │ Messages | Inbox │
│      🦫 lead         🦉 research │                   │
│    [#1][#2]         [#5]         │ [task cards]      │
│     ----           ----          │ [notifications]   │
│      │               │           │ [navigation tree] │
│   🦊 impl          🐻 tester    │                   │
│    [#3]             [#6]         │                   │
│                                   │                   │
│  ══════ ground ══════════════════│                   │
│  ⎇ main    ⎇ feature/nav        │                   │
│                          [+][-]  │                   │
│                          [□][⊕]  │                   │
└───────────────────────────────────┴──────────────────┘
```

Task clipboards ([#N]) sit beside each agent. Zoom controls overlay bottom-right of SVG. Breadcrumbs in header. Navigation tree in sidebar. Inbox as a new sidebar tab with badge.

### Animation consistency:
- All transitions: 0.15s-0.2s ease
- Pulsing effects: 1.5s cycle (same as existing gear/steam)
- Use existing `fadeInUp` for popovers and dropdowns
- Use existing `conveyor-move` for active task connection lines
