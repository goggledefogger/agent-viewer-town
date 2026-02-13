# Agent Information Hierarchy Spec

How agent information is displayed across three levels: glanceable (above character), contextual (below character), and detailed (on-click panel).

## Design Principles

1. **Scan-and-drill**: The scene should be glanceable in <2 seconds. You scan the bubbles to find who needs attention, then click for detail.
2. **State first, action second**: The most important thing is *what state* the agent is in (blocked, working, idle, done). The *what they're doing* is secondary.
3. **No duplication**: Each datum appears in exactly one place.
4. **Progressive disclosure**: Each level adds information, never repeats.

---

## Level 1: Above the Character (Action Bubble)

**Purpose**: What is this agent doing *right now*?

**Max width**: ~200px bubble (roughly 40 monospace chars at 7.5px font).

**Content by state**:

| State | Line 1 (primary, 8px bold) | Line 2 (secondary, 7px dim) |
|-------|---------------------------|----------------------------|
| Working | Tool action (e.g. "Editing hooks.ts") | File path context or search pattern |
| Working (no action yet) | Typing dots animation | -- |
| Waiting for input | "Needs your input!" (pulsing amber) | Tool that triggered the wait |
| Idle | -- (no bubble) | -- |
| Done | "Done" with checkmark | -- |
| Compacting | "Compacting..." | -- |

**Line 1** is the current `currentAction` string, shown as-is up to 40 chars, then truncated with ellipsis.

**Line 2** is NEW. It provides supporting context extracted from the action:
- For file operations: the parent directory (e.g. `src/components/`)
- For search operations: the glob/file filter (e.g. `in *.tsx`)
- For Bash commands: the description if different from command summary
- For messaging: the recipient name
- For spawning: the subagent type (e.g. `(researcher)`)
- For task ops: the task subject snippet

This requires a new field on AgentState: `actionContext?: string`.

**Truncation priority**: Cut line 2 first, then truncate line 1. Never cut the state indicator (working dots, waiting alert).

---

## Level 2: Below the Character (Status Line)

**Purpose**: Who is this agent, and what's its overall progress?

**Position**: Below the name label, at approximately y=48. The name label stays at y=38.

**Max width**: ~50 chars at 7px font.

**Content**:

```
[RoleIcon] role-name  |  N tasks done
```

Examples:
- `Lead  |  3 tasks done`
- `Researcher  |  0 tasks`
- `Implementer  |  working on #7`
- `Subagent of fox-1`

For subagents, show parentage instead of task count (their tasks aren't independently tracked).

**What goes here vs. above**: The status line is *identity and progress* (slow-changing). The action bubble is *live activity* (fast-changing). They never overlap.

**New field needed**: `currentTaskId?: string` -- the task ID the agent is currently working on (set when TaskUpdate marks a task as `in_progress` with this agent as owner). Allows showing "working on #7" in the status line.

---

## Level 3: On-Click Detail Panel

**Purpose**: Full context for debugging or understanding what an agent is up to.

**Implementation**: Replaces the current `AgentDetail` popover with a richer panel. Rendered as an SVG overlay anchored to the agent position, or optionally as an HTML overlay outside the SVG for better text rendering.

**Layout** (top to bottom):

```
+------------------------------------------+
| [Role Icon]  agent-name           [status dot] |
| Role: Implementer  |  Tasks: 3/5         |
|------------------------------------------|
| CURRENT ACTIVITY                         |
| Editing packages/server/src/hooks.ts     |
| (full path, not truncated)               |
|                                          |
| CURRENT TASK                             |
| #7: Add tests for hook event handlers    |
| Status: in_progress                      |
|                                          |
| RECENT ACTIONS (last 3-5)               |
| 12:04  Reading types.ts                  |
| 12:03  Searching: "handleEvent"          |
| 12:02  Running tests                     |
|                                          |
| MESSAGES (last 2-3)                      |
| 12:01  -> team-lead: "Tests passing"     |
| 11:58  <- team-lead: "Add edge cases"    |
+------------------------------------------+
```

**Sections in priority order** (if panel must be compact, cut from bottom up):

1. **Header**: Name, role, status dot (always shown)
2. **Current activity**: Full untruncated `currentAction` + `actionContext` (always shown)
3. **Current task**: The task this agent owns that is `in_progress` (shown if available)
4. **Recent actions**: Last 3-5 tool actions with timestamps (shown if space permits)
5. **Recent messages**: Last 2-3 messages to/from this agent (shown if space permits)

**New fields needed for this level**:

- `recentActions?: Array<{ action: string; timestamp: number }>` -- ring buffer of last 5 actions, maintained server-side
- `currentTaskId?: string` -- (shared with Level 2)

---

## New AgentState Fields Summary

```typescript
interface AgentState {
  // ... existing fields ...

  /** Supporting context for the current action (directory, filter, recipient) */
  actionContext?: string;

  /** ID of the task this agent is currently working on */
  currentTaskId?: string;

  /** Ring buffer of recent actions for the detail panel (last 5) */
  recentActions?: Array<{ action: string; timestamp: number }>;
}
```

---

## Examples by Agent State

### 1. Team lead, working, has active task

**Above** (action bubble):
```
Creating task: Add unit tests
(for task board)
```

**Below** (status line):
```
Lead  |  2 tasks done
```

**On-click**: Full action, current task #4 details, recent actions, messages sent to teammates.

---

### 2. Implementer, working on file edit

**Above**:
```
Editing AgentCharacter.tsx
src/components/
```

**Below**:
```
Implementer  |  working on #7
```

**On-click**: Full file path, task #7 subject/status, last 5 file edits, recent messages.

---

### 3. Agent waiting for user input

**Above** (amber pulsing bubble):
```
Needs your input!
Approve: rm -rf node_modules
```

**Below**:
```
Implementer  |  working on #3
```

**On-click**: Full tool details that need approval, task context.

**How waiting is detected**: `waitingForInput` is only set by:
1. **Hooks `PermissionRequest`** — definitive signal from Claude Code when user approval is needed
2. **JSONL immediate-trigger tools** — `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode` (these always require input)

The old delayed-timeout heuristic (45s after tool_use without tool_result) was removed because it caused false positives. Permission prompts for other tools (Bash, Edit, etc.) are detected via hooks only.

---

### 4. Subagent, actively working

**Above**:
```
Searching: "handleEvent"
in *.ts
```

**Below**:
```
Subagent of fox-1
```

**On-click**: Full search pattern, parent agent info, spawned-at time.

---

### 5. Agent idle (between prompts)

**Above**: No bubble (clean).

**Below**:
```
Researcher  |  1 task done
```

**On-click**: Last action performed, last task completed, recent messages.

---

### 6. Agent done (session ended)

**Above**:
```
Done
```

**Below**:
```
Tester  |  4 tasks done
```

**On-click**: Summary of all tasks completed, final action.

---

## Server-Side Changes

### actionContext generation

In `hooks.ts` `describeToolAction`, return a `{ action, context }` tuple instead of a plain string:

| Tool | action | context |
|------|--------|---------|
| Read/Edit/Write | "Editing hooks.ts" | "packages/server/src/" |
| Bash | description or command summary | -- |
| Grep/Glob | "Searching: pattern" | "in *.tsx" or directory |
| Task | "Spawning: description" | "(researcher)" |
| SendMessage | "Messaging fox-1" | -- |
| TaskCreate | "Creating task: subject" | -- |
| TaskUpdate | "Task #7: in_progress" | -- |

The context is the secondary line -- the part that would be cut first when space is tight.

### recentActions ring buffer

In `StateManager.updateAgentActivityById()`, push `{ action, timestamp: Date.now() }` to a ring buffer (max 5 entries). Ship this array to the client on `agent_update` messages.

### currentTaskId tracking

In `extractTaskUpdate()`, when a task is set to `in_progress` with an owner, set `currentTaskId` on the matching agent. When a task completes or the agent goes idle, clear it.

---

## Client-Side Changes

### ActionBubble (Scene.tsx)

- Add a second `<text>` line for `actionContext` at y+10 below the primary action line.
- Increase bubble height from 22px to 32px when context is present.
- Keep max primary line at 40 chars, max context line at 35 chars.

### Status line (AgentCharacter.tsx)

- Add a new `<text>` element at y=48 (below existing name at y=38).
- Font size 6.5px, dimmed color (`#64748b`).
- Content: `role | N tasks done` or `role | working on #N` or `Subagent of {parent}`.

### AgentDetail (Scene.tsx)

- Expand to show sections described in Level 3.
- Use word-wrap for full action text.
- Show recent actions with relative timestamps ("2m ago").
- Show recent messages filtered to/from this agent.
- Filter messages from `state.messages` client-side (no new field needed for this).

---

## What NOT to Change

- **Agent name display**: Stays at y=38 in AgentCharacter.tsx, max 14 chars. This is the identity anchor.
- **Animal sprite**: No changes to the character rendering.
- **Steam/sparks/gear effects**: These are status indicators that complement the text, not replace it.
- **WaitingBubble**: Keep the existing amber pulsing design, just ensure the secondary line uses `actionContext` for richer detail.
