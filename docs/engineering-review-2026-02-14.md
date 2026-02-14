# Engineering Review — Recent Refactors and Feature Work

Date: 2026-02-14
Scope: Recent branch and mainline changes with focus on stale-agent handling, hook priority, watcher/state architecture, and UI complexity.

## Executive Summary

Overall trajectory is strong. The most important architectural move was making hooks the primary source of truth for live activity while keeping JSONL parsing as discovery/fallback. That was the right call and directly addresses prior race/heuristic brittleness.

The main risk now is **complexity concentration** in three files (`hooks.ts`, `watcher.ts`, `state.ts`). Behavior correctness depends on implicit ordering and many side effects spread across handlers. The code works, but maintainability risk is rising.

## What You Did Well

1. **Correctly prioritized definitive signals over heuristics**
   - Hook events are treated as canonical for lifecycle and waiting states, reducing false transitions from transcript lag.
   - Stop-hook shielding against trailing JSONL updates is a strong defensive design.

2. **Handled hard concurrency edge cases pragmatically**
   - FIFO spawn matching for Task→SubagentStart correlation is simple and practical.
   - Session de-dup and tracked-file mapping are good protections against watcher race conditions.

3. **Added healthy test depth while shipping quickly**
   - Server tests cover hooks, parser, watcher-state behavior, and regressions. This gives confidence for iterative refactors.

4. **Improved product clarity with per-session UX and richer metadata**
   - Session selection + git status visibility significantly improve operational observability for multi-branch workflows.

## What Should Be Simplified Next

1. **Break up `hooks.ts` by event domain**
   - Current file combines event typing, event routing, action formatting, task extraction, message extraction, spawn correlation, git refresh logic, and session control.
   - Suggested split:
     - `hooks/router.ts` (dispatch + validation)
     - `hooks/activities.ts` (tool/activity/waiting transitions)
     - `hooks/team.ts` (TeamCreate/Delete, TaskCreate/Update, messages)
     - `hooks/subagents.ts` (spawn correlation, lifecycle)
     - `hooks/git.ts` (git refresh triggers + throttling)
   - Keep one thin orchestration layer to avoid accidental behavior drift.

2. **Introduce a small transition model in state management**
   - `StateManager` currently mutates many collections with overlapping rules (allAgents vs displayed agents, task reconciliation, session filtering, debounced updates).
   - Add a lightweight reducer-style transition layer for core status transitions:
     - Inputs: hook event / transcript event / timer tick
     - Output: explicit state patch + emitted websocket events
   - This preserves performance while making race behavior auditable and testable.

3. **Isolate JSONL fallback from live-status writes**
   - Keep JSONL responsible for discovery, historical hydration, and message extraction.
   - Restrict JSONL live status writes to only when no hook signal has been seen recently for that session (TTL gate, e.g. 5–10s).
   - This will reduce oscillation paths and future “stale agent” regressions.

4. **Move “derived UI fields” out of mutable primary state**
   - Fields like `currentAction`, `actionContext`, `recentActions`, and current task ownership are useful, but multiple writers touch them.
   - Consider deriving display-oriented fields in a projection layer from immutable event history (or at least single-writer helpers).

## What Might Have Been Over-Engineered (or Could Be Reframed)

1. **Heavily branched parsing/action-description logic in runtime paths**
   - Tool description mapping is useful UX, but central switch statements are growing.
   - Consider a registry map keyed by tool name with unit-tested formatters. Easier to extend and review.

2. **Cross-cutting side effects inside handlers**
   - Example pattern: one event updates activity + waiting + git + message log + tasks.
   - Prefer explicit sequencing helpers with names like `applyActivityTransition`, `applyTaskMutation`, `emitNotifications`.

3. **Team vs solo filtering duplicated in several methods**
   - Session membership logic appears in multiple places. Introduce a single membership service/helper and reuse everywhere.

## Alternatives Worth Considering

1. **Event-sourcing lite (recommended)**
   - Append normalized internal events to an in-memory ring buffer.
   - Build state snapshots from the stream using pure reducers.
   - Benefits: replayability, better debugging, easier regression tests for race conditions.

2. **Session actor model (optional if scale grows)**
   - One state machine per session (solo/team), each consuming ordered events.
   - Global manager only routes and merges outputs.
   - Useful if you expect many concurrent sessions and more hook types.

3. **Policy table for signal precedence**
   - Encode precedence as data, not scattered conditionals:
     - Hook Stop > JSONL thinking/tool_call
     - PermissionRequest > inferred waiting
     - SubagentStop(team member) => idle, SubagentStop(subagent) => done + TTL removal
   - Keeps future changes safer and self-documenting.

## Risk Hotspots to Watch

1. **Memory lifecycle**
   - `allAgents`, tracked sessions, debounce timers, and pending spawn queues should have explicit cleanup policies for long-running server uptime.

2. **ID/name ambiguity**
   - Some flows still reconcile by name while others use IDs. Continue migrating toward ID-first operations everywhere.

3. **Timing-dependent behavior**
   - `setTimeout`-based removals and debounced broadcasts can hide race bugs in tests.
   - Add fake-timer tests around subagent removal and rapid hook/transcript interleavings.

## Practical Next 2–3 PR Plan

1. **PR 1: Modularization only (no behavior changes)**
   - Extract hook handlers/modules and shared helpers.
   - Keep exhaustive tests green.

2. **PR 2: Signal precedence table + TTL gate for JSONL live writes**
   - Add explicit policy tests for stale-agent/stop-hook race scenarios.

3. **PR 3: State transition helpers (or reducer-lite)**
   - Migrate highest-risk transitions first: waiting/working/idle + subagent lifecycle.

## Bottom Line

You made the right strategic moves, especially around hook-first architecture and regression hardening. The system is not too complex for its feature set yet, but it is close to the point where **structure debt** will slow you down. The best next step is modularization + explicit precedence policy, not adding more behavior in current file shapes.
