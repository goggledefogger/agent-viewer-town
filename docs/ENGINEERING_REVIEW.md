# Engineering Review — State Management & Hook Architecture

**Date**: 2026-02-14
**Scope**: Recent refactors around stale-agent handling, hook priority, session detection, subagent lifecycle, and UI composition.
**Sources**: Consolidated from 5 independent AI code reviews (Codex x4, Jules x1) plus internal analysis.

---

## Executive Summary

The most important architectural move was making hooks the primary source of truth for live activity while keeping JSONL parsing as discovery/fallback. This directly addressed prior race/heuristic brittleness and was the right call.

The main risk now is **complexity concentration** in three files (`hooks.ts`, `watcher.ts`, `state.ts`). Behavior correctness depends on implicit ordering and side effects spread across handlers. The code works — 351 tests pass — but maintainability risk is rising.

---

## What Went Well

1. **Correctly prioritized definitive signals over heuristics.**
   Hook events drive lifecycle transitions (`PreToolUse`, `Stop`, `UserPromptSubmit`), reducing false transitions from transcript lag. The `stoppedSessions` mechanism is a strong defensive pattern for race resolution.

2. **Handled hard concurrency edge cases pragmatically.**
   FIFO pending-spawn matching for `Task` → `SubagentStart` is simple and correct under concurrency. Session dedup and tracked-file mapping protect against watcher race conditions. The `removedAgents` + `registeredSubagents` + done-status guards form a layered defense against zombie subagents.

3. **Strong test investment while shipping quickly.**
   351 tests covering hooks, parser, state, server, and client behavior. Edge cases around FIFO matching, compaction handling, subagent lifecycle, per-client state, and WebSocket message handling are validated.

4. **Session model trending in the right direction.**
   Per-client session selection, richer session metadata, and multi-tab support are foundational for reliability.

---

## Complexity Hotspots

### 1. StateManager is a god object
**Risk: HIGH | Consensus: 5/5 reviews**

`StateManager` owns: session registry, agent registry (two stores!), display state projection, activity debounce timers, stop-protection flags, git metadata, task reconciliation, session filtering, and WebSocket broadcast transport.

This makes change safety harder — almost every feature touches the same class.

**Recommendation**: Split into focused modules behind one facade:
- `AgentStore` — canonical agent registry by ID
- `SessionStore` — session metadata + activity timestamps
- `ProjectionStore` — derived, client-facing TeamState per session
- `EventBus` — broadcast concerns

### 2. Session/team membership logic is duplicated
**Risk: HIGH | Consensus: 5/5 reviews**

Rules for "which agents belong to which view" appear in `selectSession()`, `getStateForSession()`, `agentBelongsToSession()`, and parts of watcher and WebSocket filtering. Duplication invites divergence.

**Recommendation**: Centralize into one pure selector utility used everywhere. This is the lowest-risk, highest-ROI refactor.

### 3. hooks.ts is doing too many jobs
**Risk: HIGH | Consensus: 3/5 reviews**

Currently combines: event typing, event routing, action formatting, task/team extraction, message extraction, spawn correlation, git refresh, and direct state mutations.

**Recommendation**: Split by event domain:
- `hooks/router.ts` — dispatch + validation
- `hooks/activity.ts` — tool/activity/waiting transitions
- `hooks/team-tools.ts` — TeamCreate/Delete, TaskCreate/Update, messages
- `hooks/subagents.ts` — spawn correlation, lifecycle
- `hooks/git.ts` — git detection/refresh triggers

Keep one thin orchestration layer (`hooks/index.ts`) to avoid accidental behavior drift.

### 4. Dual agent stores create sync burden
**Risk: MEDIUM | Consensus: 2/5 reviews**

`allAgents` (persistent registry) and `state.agents` (display-filtered view) are updated manually in many methods. Mirrored update logic increases drift risk.

**Recommendation**: Treat `allAgents` as the single source of truth. Compute `state.agents` as a projection per session/client instead of mutating two lists. Memoize if performance becomes a concern.

### 5. Event precedence is convention, not architecture
**Risk: MEDIUM | Consensus: 5/5 reviews**

Hooks and watcher both update activity/waiting/status. Safety checks exist, but priority lives in scattered conditionals rather than a declarative policy.

**Recommendation**: Document and encode a precedence table:
- Hook `Stop` > JSONL `thinking`/`tool_call`
- `PermissionRequest` > inferred waiting
- `SubagentStop(team)` → idle, `SubagentStop(subagent)` → done + TTL removal

A dedicated `applyEventWithPriority(source, event)` utility would make this deterministic.

### 6. Timer/lifecycle ownership is distributed
**Risk: MEDIUM | Consensus: 3/5 reviews**

Debounce timers, stale checks, delayed removals, and stopped-session flags are spread across hooks, watcher, and state manager. This works but trends toward "emergent behavior" bugs.

**Recommendation**: Create one scheduler module for activity debounce, staleness transitions, and delayed subagent cleanup. Single ownership makes shutdown/cleanup safer.

---

## What NOT to Change

These areas are stable and don't warrant refactoring investment right now:

1. **Don't remove the JSONL watcher** — it provides session discovery/bootstrap that hooks alone don't guarantee, and enables future non-Claude-Code agent support.
2. **Don't over-abstract the UI** — `Scene.tsx` is understandable; the biggest risk is server-side behavior complexity, not rendering.
3. **Don't chase event-sourcing/state machines** — these are premature at the current scale. The transition model works with good test coverage.
4. **Don't optimize performance** — correctness and transition determinism matter more than shaving map/filter costs.

---

## Refactoring Roadmap

### Phase 1: Membership Centralization (low risk, immediate value)
- Extract one canonical `agentBelongsToSession()` function
- Reuse in all filtering callsites
- Add edge-case tests (duplicate names, cross-session)
- This creates the seam for future StateManager decomposition

### Phase 2: hooks.ts Modularization (medium risk, structural)
- Split into 5 focused modules + thin orchestrator
- All existing tests must pass without modification
- Add ARCHITECTURE.md describing module boundaries

### Phase 3: State Domain Extraction (higher risk, architectural)
- Extract AgentStore, SessionStore, ProjectionStore
- Migrate highest-risk transitions first: waiting/working/idle + subagent lifecycle
- Consider reducer-style transition helpers for auditable state changes

### Phase 4: Hardening Tests
- Event ordering permutation tests (Stop before/after trailing JSONL)
- Duplicate agent names across sessions
- Simultaneous subagent start/stop bursts
- Team delete + lingering transcript updates

---

## Guard Mechanisms (current state)

For reference, these are the layered defenses currently preventing stale agent bugs:

| Mechanism | Location | Purpose |
|-----------|----------|---------|
| `removedAgents` Map | state.ts | Blocks `registerAgent`/`updateAgent` for recently removed agents (5-min TTL) |
| `stoppedSessions` Set | state.ts | Blocks JSONL from overriding Stop/SubagentStop (cleared by PreToolUse/UserPromptSubmit) |
| `hookActiveSessions` Map | state.ts | Prioritizes hook updates over JSONL for sessions with recent hook activity |
| `registeredSubagents` Set | watcher.ts | Prevents duplicate subagent detection from multiple file events |
| Done-status check | watcher.ts | Skips re-registration of subagents already marked done by SubagentStop |
| `clearRecentlyRemoved()` | hooks.ts | Allows legitimate re-spawns by clearing the removal flag on SubagentStart |
