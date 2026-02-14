# Architecture & Change Review (last ~2 days)

## Scope reviewed

- Recent commit stream focused on hook priority, stale-agent cleanup, session detection, UI overlap, and git status visibility.
- Core server flow in:
  - `packages/server/src/hooks.ts`
  - `packages/server/src/watcher.ts`
  - `packages/server/src/state.ts`
- Core client rendering flow in:
  - `packages/client/src/App.tsx`
  - `packages/client/src/components/Scene.tsx`
  - `packages/client/src/components/AgentCharacter.tsx`

## What went well

1. **Good strategic direction: hooks as authoritative lifecycle signals.**
   - Prioritizing hook events over JSONL heuristics is the right long-term move for correctness and lower UI flicker.
   - The explicit Stop/session-stopped mechanism addresses a real race condition between streams.

2. **Test coverage depth is excellent for fast-moving refactors.**
   - Hook/state/parser/server test suites are broad enough to support frequent behavior changes.
   - Edge-case handling (FIFO spawn matching, stale spawn cleanup, status transitions) is already validated.

3. **User-facing responsiveness improved without a heavy framework rewrite.**
   - Debounced activity updates and compacting state handling reduce visual noise.
   - Mobile tab support and overlap fixes show strong iterative UX refinement.

4. **Session model is trending in the right direction.**
   - Per-client session selection and richer session metadata are foundational for multi-tab, multi-agent reliability.

## Risks / complexity hotspots

1. **`StateManager` is becoming a god object.**
   - It currently owns session registry, agent registry, display state projection, activity debounce timers, stop flags, task reconciliation, and broadcast transport behavior.
   - This makes change safety harder: almost every feature touches the same class.

2. **Dual agent stores (`allAgents` + `state.agents`) create high sync burden.**
   - Many methods update both structures manually, which increases drift risk and patch complexity.
   - This is already visible in repeated mirrored update logic.

3. **Name-based identity still appears in important paths.**
   - Some updates still target agents by `name` instead of stable `id`.
   - This can regress with duplicate names, renamed agents, or team/solo overlap.

4. **Lifecycle/timer ownership is distributed across watcher + hooks + state manager.**
   - Debounce timers, stale checks, delayed removals, and stopped-session flags are spread across files.
   - It works today, but this style trends toward “emergent behavior” bugs as features grow.

5. **Session/team membership derivation is repeated.**
   - Logic to determine what belongs to a session appears in multiple places.
   - Repeated filtering can diverge subtly and is expensive to reason about during incident debugging.

## Suggestions: what to simplify next

### 1) Split state into explicit domains

Create smaller modules behind one facade:
- `AgentStore` (canonical agent registry by ID)
- `SessionStore` (session metadata + activity timestamps)
- `ProjectionStore` (derived, client-facing TeamState per session)
- `EventBus` (broadcast concerns)

This keeps API surface stable while reducing edit collision and cognitive load.

### 2) Move to a single canonical agent store

- Treat `allAgents` as source of truth.
- Compute display lists (`state.agents`) as a projection per session/client instead of mutating two lists.
- Keep projection memoized if perf becomes a concern.

This change alone would remove a lot of sync bugs.

### 3) Finish migration to ID-only updates

- Keep `updateByName` paths as compatibility wrappers only.
- Internally resolve names once at ingestion, then process exclusively by `agentId`.
- Add tests for duplicate names across sessions to lock behavior.

### 4) Introduce explicit event precedence policy

Document and enforce (in code) a simple rule set, e.g.:
- Hooks override JSONL for status transitions.
- JSONL still contributes message/task context when hooks are absent.
- Stop creates a “status lock” until UserPromptSubmit/PreToolUse.

A dedicated `applyEventWithPriority(source, event)` utility can make this deterministic.

### 5) Centralize lifecycle timers

Create one scheduler module for:
- activity debounce
- staleness transitions
- delayed subagent cleanup

Single ownership makes shutdown/cleanup safer and reduces hidden coupling.

## Alternatives you could have chosen (and when)

1. **Event-sourcing lite (append-only in-memory event log + reducers).**
   - Better if you expect more event types quickly.
   - Makes “why did state become this?” auditable.

2. **State machine for agent lifecycle.**
   - Better if transitions continue expanding (working/waiting/compacting/done/idle).
   - Prevents illegal transitions and race-condition regressions.

3. **Keep current architecture but add “consistency assertions” in dev mode.**
   - Lowest-cost near-term option.
   - Example: assert no agent exists in projection without canonical registry entry, and no unresolved name-based write in new code paths.

## Practical 1-week hardening plan

1. Add `ARCHITECTURE.md` with event precedence + ownership map.
2. Refactor one slice only: agent activity updates to ID-only internals.
3. Extract timer/scheduler helper.
4. Add 4-6 “race safety” tests:
   - Stop then trailing JSONL tool call
   - duplicate agent names across sessions
   - simultaneous subagent start/stop bursts
   - team delete + lingering transcript updates
5. Add lightweight debug counters (events/sec by source, dropped updates).

## Bottom line

- **You did many of the right things** (hooks-first, strong tests, targeted UX fixes).
- **The current risk is architectural concentration**, not feature correctness.
- If you spend one focused refactor cycle on state/event boundaries now, future feature velocity should increase while regressions drop.
