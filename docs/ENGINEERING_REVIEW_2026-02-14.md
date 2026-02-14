# Engineering review (last ~2 days)

This review focuses on the recent hook-priority/stale-agent work and the surrounding refactors in session detection, state handling, and UI composition.

## What went well

1. **You moved toward authoritative signals (hooks) instead of timing heuristics.**
   - Hook events now drive activity transitions (`PreToolUse`, `Stop`, `UserPromptSubmit`, etc.), reducing dependence on guessed JSONL timing behavior.
2. **Race conditions were addressed deliberately.**
   - `Stop` marks sessions as stopped and watcher initialization honors that state, preventing post-stop transcript replay from reactivating agents.
3. **Subagent correlation improved meaningfully.**
   - FIFO pending-spawn matching for `Task` → `SubagentStart` is the right direction for concurrent subagent starts.
4. **Test coverage is strong and broad.**
   - Hook/state/parser tests are extensive, including edge cases around FIFO matching, compaction handling, and fallback behavior.
5. **Session model maturity is improving.**
   - Per-client session selection and session-scoped snapshots are good primitives for multi-tab correctness.

## Where complexity is starting to hurt

1. **Server behavior is split across two competing truth sources (hooks + watcher).**
   - Hooks and watcher both update activity/waiting/status; there are safety checks, but policy still lives in two places.
   - This creates “priority by convention” rather than “priority by architecture.”

2. **`hooks.ts` is becoming a god-module.**
   - It now mixes event parsing, task/team extraction, git refresh, spawn correlation, and direct state mutations in one file/function scope.
   - The growing switch/handler surface will keep increasing coupling and regression risk.

3. **`StateManager` combines store + derivation + event transport + selection policy.**
   - It mutates domain state, computes session views, performs dedupe/debounce, and emits websocket messages.
   - This increases incidental complexity and makes invariants hard to prove (especially for session/agent ownership rules).

4. **Mutable structures + timer-based cleanup are fragile around lifecycle boundaries.**
   - Pending spawn maps and delayed subagent removals are practical, but can drift if process restarts or if IDs get reused.

5. **Team-vs-solo filtering logic is duplicated in multiple methods.**
   - Similar filtering appears in `selectSession`, `getStateForSession`, and `agentBelongsToSession`, raising maintenance cost.

## What I would simplify next (highest ROI)

1. **Introduce a single event reducer pipeline in server core.**
   - Convert watcher lines and hook events into one internal event stream with explicit precedence metadata.
   - Apply one reducer to produce state transitions; let websocket broadcasting be a pure subscriber.

2. **Break `hooks.ts` into focused modules.**
   - Example split:
     - `hook-router.ts` (event discrimination)
     - `hook-activity.ts` (status/waiting transitions)
     - `hook-team-tools.ts` (`TeamCreate/Delete`, task extraction)
     - `hook-subagents.ts` (spawn tracking + lifecycle)
     - `hook-git.ts` (git detection/refresh)

3. **Define explicit state machine transitions for agent status.**
   - Document allowed transitions (e.g., `working -> idle` from `Stop/TeammateIdle/staleness`) and enforce with one transition helper.
   - This will prevent accidental contradictory updates from watcher + hooks.

4. **Centralize session-agent ownership queries.**
   - Extract one canonical helper for “which agents belong to session X?” and reuse everywhere.

5. **Move noisy logs behind debug flags.**
   - Keep operator-relevant warnings/errors always on; gate high-volume hook lifecycle logs with `DEBUG` style flags.

## What I would *not* change right now

1. **Do not remove the watcher yet.**
   - It still provides session discovery/bootstrap that hooks alone do not guarantee.
2. **Do not over-abstract UI now.**
   - UI is currently understandable; biggest risk is server-side behavior complexity, not rendering.
3. **Do not chase micro-optimizations yet.**
   - Correctness and transition determinism matter more than shaving small map/filter costs.

## Concrete 1-week hardening plan

1. Add a tiny internal event envelope (`source`, `timestamp`, `priority`, `sessionId`, payload).
2. Implement reducer entrypoint and migrate just activity/waiting transitions first.
3. Add invariant tests:
   - stopped session cannot return to working without `UserPromptSubmit`/`PreToolUse`
   - subagent removal cannot remove team member
   - one event cannot make agent both waiting and done
4. Extract session ownership helper and replace duplicated filters.
5. Enable debug-gated logging and keep tests validating major log-side effects only where needed.
