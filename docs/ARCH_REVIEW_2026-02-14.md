# Architecture & Change Review (last ~2 days)

## Scope reviewed
- Commit history on local `work` branch from 2026-02-11 through 2026-02-13.
- Focus on recent refactors around stale agents, hook-vs-watcher priority, session handling, and UI layout evolution.
- Note: this repository currently has no Git remote configured in this environment, so branch-to-branch comparison beyond local history is limited.

## What went well
1. **Hooks are now treated as authoritative lifecycle signals**, and JSONL parsing has shifted toward supplemental/compatibility behavior. This reduced heuristic drift and race conditions.
2. **The Stop-hook race was fixed in a principled way** using explicit `stoppedSessions` state instead of timing hacks.
3. **Per-client session filtering is in place**, enabling independent tab/session views and reducing cross-session contamination.
4. **Test investment is strong** (300+ tests), especially in hook/state behavior where regressions were occurring.
5. **UI overlap fixes and subagent cleanup behavior improved UX clarity** (e.g., removal delay and bubble simplification).

## Key concerns and suggested simplifications

### 1) `StateManager` has become a god-object
`StateManager` now owns session registry, displayed state, all-agent registry, websocket broadcasting, debounce timers, stop-protection flags, git metadata, task reconciliation, and session filtering. This makes correctness harder to reason about and increases coupling.

**Suggestion:** split into focused modules:
- `SessionRegistry` (sessions + selection logic),
- `AgentRegistry` (all agents + display projection),
- `ActivityCoordinator` (waiting/working/stop/debounce rules),
- `Broadcaster` (message fanout + throttling).

This can be done incrementally with no behavior change by extracting pure helpers first.

### 2) Hook and watcher responsibilities still overlap
The system is better than before, but both hooks and watcher still update activity/waiting state. That overlap can still produce subtle edge cases when event ordering differs.

**Suggestion:** define and document a strict precedence contract:
- Hooks own lifecycle/activity state transitions.
- Watcher owns discovery/bootstrap + message extraction + fallback-only status changes.
- Fallback transitions should be gated behind “no recent hook event” per session.

### 3) `hooks.ts` is doing many jobs in one file
`hooks.ts` currently includes event typing, tool-action labeling, session cwd/git tracking, pending spawn matching, message extraction, task extraction, and lifecycle handling.

**Suggestion:** separate by concern:
- `hook-events.ts` (types + dispatch),
- `hook-lifecycle.ts` (session/subagent/start-stop),
- `hook-team-tools.ts` (TeamCreate/TaskCreate/TaskUpdate/SendMessage extraction),
- `hook-action-describer.ts`.

This would make future hook additions lower-risk.

### 4) Session/team membership logic is duplicated
Rules for “which agents belong to which view” appear in multiple methods (`selectSession`, `getStateForSession`, `agentBelongsToSession`, parts of watcher and websocket filtering). Duplication invites divergence.

**Suggestion:** centralize into one pure selector utility used everywhere.

### 5) Large UI component concentration in `Scene.tsx`
`Scene.tsx` mixes layout algorithms, SVG rendering, branch lane visuals, bubbles, details popover, text wrapping, and interaction state. It’s feature-rich but hard to evolve safely.

**Suggestion:** split into:
- `layout/computePositions.ts`,
- `overlays/ActionBubble.tsx`, `overlays/WaitingBubble.tsx`, `overlays/AgentDetail.tsx`,
- `SceneCanvas.tsx` (composition only).

### 6) Consider reducing noisy logging in test/runtime path
The hook tests currently emit large volumes of console output, which is okay for debugging but can obscure failures in CI logs.

**Suggestion:** add a logger abstraction with levels; keep debug logs optional.

## Specific decisions that were good
- **`stoppedSessions` gate** is a strong fix pattern for race resolution.
- **Always forwarding `agent_removed` websocket events** avoids state-derived filtering blind spots.
- **FIFO matching for Task→SubagentStart** is a practical correctness improvement under concurrency.
- **Subagent removal delay reduction (2m → 15s)** is a better UX trade-off.

## Things to watch next
1. Ensure stale-session logic does not demote legitimately active sessions when only one source (hooks or watcher) is quiet.
2. Add contract tests for “event ordering permutations” (Stop before/after trailing JSONL, rapid PreTool/PostTool interleaving).
3. Add a small architecture doc describing ownership boundaries between hook pipeline, watcher pipeline, and state layer.

## Practical next step (low risk)
Implement one pure module first: `agentBelongsToSession(session, agent, allSessions)` and use it in all filtering callsites. This yields immediate consistency and creates a seam for larger refactors.
