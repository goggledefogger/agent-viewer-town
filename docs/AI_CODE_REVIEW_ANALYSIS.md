# AI Code Review Analysis — Agent Viewer Town

**Date**: 2026-02-14
**Reviewed by**: Claude Opus (analyzing PRs from Codex and Jules)
**PRs analyzed**: #21, #22, #23, #24 (Codex/OpenAI), #25 (Jules/Google)

---

## Overview

Five PRs were submitted by AI agents reviewing the recent work on stale-agent handling, hook priority, and subagent differentiation. Four are documentation-only architectural reviews (Codex), and one includes actual code fixes (Jules).

| PR | Agent | Type | Files | Summary |
|----|-------|------|-------|---------|
| #21 | Codex | Doc only | `docs/ARCH_REVIEW_2026-02-14.md` (77 lines) | Shorter arch review — likely an earlier/interrupted attempt |
| #22 | Codex | Doc only | `docs/ARCH_REVIEW_2026-02-14.md` (128 lines) | Most comprehensive arch review with alternatives analysis |
| #23 | Codex | Doc only | `docs/engineering-review-2026-02-14.md` (114 lines) | Engineering review with concrete 2-3 PR plan |
| #24 | Codex | Doc only | `docs/ENGINEERING_REVIEW_2026-02-14.md` (80 lines) | Tighter engineering review with 1-week hardening plan |
| #25 | Jules | Code fix | `hooks.ts`, `watcher.ts`, `package-lock.json` | Adds `markSessionStopped` in SubagentStop + tracked session cleanup |

**Note**: PRs #21-24 all share the same Codex task ID — they're four separate attempts at the same review prompt. PRs #21 and #22 conflict (same filename, different content).

---

## Agent Quality Assessment

### Codex PR #21 — "Codex-generated pull request" (placeholder title)
**Quality: 5/10**

- Placeholder PR body ("encountered an unexpected error")
- Content is actually a reasonable 77-line review but feels like a draft of #22
- Six concerns listed, all valid but less detailed than the other attempts
- Missing practical next steps beyond a single "extract one pure module" suggestion
- **Verdict**: Superseded by #22

### Codex PR #22 — "Architecture review and simplification recommendations"
**Quality: 8/10**

- Best structured of the four Codex attempts
- Clear "risks → suggestions → alternatives → hardening plan" flow
- Good specificity: names exact modules to extract, mentions exact patterns like `allAgents` dual-store
- "Alternatives you could have chosen" section is genuinely useful for understanding trade-offs
- Practical 1-week plan with 5 concrete steps
- One weakness: suggests "consistency assertions in dev mode" as alternative but doesn't elaborate
- **Verdict**: Best overall Codex review. Keep this one.

### Codex PR #23 — "Engineering review for recent hook/stale-agent refactors"
**Quality: 7.5/10**

- Strongest "executive summary" — concisely nails the core risk: "complexity concentration in three files"
- Best module split proposal for hooks.ts (5-way split with clear names)
- "What might have been over-engineered" section is unique and valuable — no other review mentions this
- Practical 2-3 PR plan is realistic and well-sequenced
- "Policy table for signal precedence" idea is the most actionable of all the reviews
- Weakness: some suggestions overlap between sections, reads a bit repetitive
- **Verdict**: Best specific action items. Merge insights with #22.

### Codex PR #24 — "Engineering review of recent hook/stale-agent refactors"
**Quality: 6.5/10**

- Most concise (80 lines) — good information density
- "What I would NOT change right now" section is valuable — shows judgment about what to leave alone
- Good invariant test suggestions (e.g., "stopped session cannot return to working without UserPromptSubmit/PreToolUse")
- Weakness: less detailed than #22 or #23 on specific refactoring steps
- The "event envelope" suggestion is interesting but feels premature for this project's scale
- **Verdict**: Useful for the "don't change" guidance and test ideas. Fold into synthesis.

### Jules PR #25 — "Fix zombie subagent resurrection and tracked session leaks"
**Quality: 7/10**

- **Only PR with actual code changes** — shipped a fix, not just a review
- Correctly identified a real gap: SubagentStop doesn't call `markSessionStopped()`
- Tracked session cleanup in staleness loop is a genuine memory leak fix we missed
- However: based against `main`, so doesn't see our PR #20 guards (`removedAgents`, `registeredSubagents`, done-status check) which already address the resurrection bug through a different mechanism
- The `package-lock.json` change (removing `peer: true` from fsevents) is suspicious/unnecessary
- **Verdict**: Good code instinct. The `markSessionStopped` addition and tracked session cleanup are worth cherry-picking, even though our existing guards partially cover the same scenario. Defense in depth.

---

## Common Themes & Priority Assessment

Every theme below indicates how many of the 5 reviews mentioned it.

### HIGH IMPORTANCE

| # | Theme | Mentioned by | Complexity | Priority |
|---|-------|-------------|-----------|----------|
| 1 | **StateManager is a god object** — owns too many concerns (registry, projection, debounce, transport, filtering) | All 5 | Medium | HIGH |
| 2 | **Session/team membership logic duplicated** in `selectSession`, `getStateForSession`, `agentBelongsToSession` | All 5 | Low | HIGH |
| 3 | **hooks.ts should be split** into focused modules (router, activity, team-tools, subagents, git) | #22, #23, #24 | Medium | HIGH |
| 4 | **Explicit event precedence policy** — hooks vs JSONL priority is convention, not architecture | All 5 | Medium | HIGH |

### MEDIUM IMPORTANCE

| # | Theme | Mentioned by | Complexity | Priority |
|---|-------|-------------|-----------|----------|
| 5 | **Dual agent stores (allAgents + state.agents)** create sync burden | #22, #23 | Medium | MEDIUM |
| 6 | **Name-based updates should finish migrating to ID-only** | #22, #24 | Low | MEDIUM |
| 7 | **Timer/lifecycle ownership distributed** across 3 files | #22, #23, #24 | Medium | MEDIUM |
| 8 | **SubagentStop should call markSessionStopped** (defense in depth) | #25 (code) | Low | MEDIUM |
| 9 | **Tracked session cleanup** for removed agents (memory leak) | #25 (code) | Low | MEDIUM |

### LOW IMPORTANCE (or premature)

| # | Theme | Mentioned by | Complexity | Priority |
|---|-------|-------------|-----------|----------|
| 10 | **Logger abstraction / debug flags** for hook test output | #21, #24 | Low | LOW |
| 11 | **Scene.tsx should be split** into layout + overlays | #21 | Medium | LOW |
| 12 | **Event-sourcing lite** (ring buffer + reducers) | #22, #23 | High | LOW (premature) |
| 13 | **State machine for agent lifecycle** | #22, #24 | High | LOW (premature) |
| 14 | **Event envelope with priority metadata** | #24 | Medium | LOW (premature) |
| 15 | **Tool description registry map** instead of switch statements | #23 | Low | LOW |

---

## Gap Analysis: What Jules Fixed vs Our PR #20

Jules's PR #25 targets the same zombie subagent problem our PR #20 solves, but through a different mechanism:

| Scenario | Our PR #20 guard | Jules PR #25 guard |
|----------|------------------|-------------------|
| Watcher detects subagent file after SubagentStop | `wasRecentlyRemoved()` blocks `registerAgent`/`updateAgent` | `isSessionStopped()` blocks `detectSession` early |
| Watcher detects subagent file during 15s done→remove window | `existingSubagent?.status === 'done'` check skips | `markSessionStopped()` on SubagentStop prevents entry |
| Tracked session stays in memory after agent removed | Not addressed | Cleaned up in staleness loop |
| Subagent re-detected from same file event | `registeredSubagents` Set deduplicates | Not addressed |

**Conclusion**: Our guards are more comprehensive for the resurrection bug, but Jules found two real gaps:
1. The 15-second window between `done` and `removeAgent` where `wasRecentlyRemoved` isn't active yet — `markSessionStopped` covers this
2. Memory leak from tracked sessions that reference removed agents — needs cleanup

---

## Recommendations

### What to incorporate now (next 1-2 PRs)

1. **Cherry-pick Jules's `markSessionStopped` in SubagentStop** — defense-in-depth, 1 line
2. **Add tracked session cleanup** from Jules — memory leak fix, ~8 lines
3. **Centralize session membership into one helper** — all 5 reviews agree, low complexity, immediate consistency win
4. **Add the invariant tests** from #24's hardening plan:
   - Stopped session cannot return to working without PreToolUse/UserPromptSubmit
   - SubagentStop removal cannot remove a team member
   - Duplicate agent names across sessions handled correctly

### What to plan for a future refactor cycle

5. **Split hooks.ts** using #23's proposed structure (router, activity, team-tools, subagents, git)
6. **Extract state domains** from StateManager (AgentStore, SessionStore, ProjectionStore)
7. **Document event precedence** as an architecture doc (not just code comments)

### What to skip

8. Event-sourcing lite — premature for current scale
9. State machine formalization — transitions are manageable with current tests
10. Scene.tsx split — UI is understandable, server-side complexity is the real risk
11. Event envelope with priority metadata — adds abstraction without solving current bugs
12. Logger abstraction — console.log works fine at this scale

### Which review docs to keep

- **Merge #22 and #23** into one consolidated review doc
- **Close #21** (superseded by #22)
- **Close #24** (fold unique ideas into the merged doc)
- **Close #25** after cherry-picking the code changes (it was based on main, pre-PR #20)

---

## Implementation Plan

### PR A: Defense-in-depth fixes (small, targeted)
**Estimated: ~30 lines changed**

1. Add `markSessionStopped(agentId)` in `handleSubagentStop` after setting to 'done' (from Jules)
2. Add tracked session cleanup in watcher staleness loop (from Jules, adapted to our code)
3. Add 3 invariant tests:
   - SubagentStop marks session as stopped
   - Staleness loop cleans up tracked sessions for removed agents
   - Stopped subagent cannot be resurrected during done→remove window
4. Run full test suite, commit, push to our branch

### PR B: Membership centralization (refactor, no behavior change)
**Estimated: ~50 lines changed**

1. Extract `agentBelongsToSession()` logic into a single pure function
2. Reuse in `selectSession()`, `getStateForSession()`, and WebSocket filtering
3. Add tests for edge cases (duplicate names, cross-session)
4. This sets up the seam for future StateManager decomposition

### PR C: hooks.ts modularization (refactor, no behavior change)
**Estimated: ~200 lines moved, ~50 lines new**

1. Split into: `hooks/router.ts`, `hooks/activity.ts`, `hooks/team-tools.ts`, `hooks/subagents.ts`, `hooks/git.ts`
2. Keep thin orchestration in `hooks/index.ts`
3. All existing tests must pass without modification
4. Add architecture doc describing module boundaries

### PR D: Consolidated review doc
1. Merge best insights from PRs #22 and #23 into `docs/ENGINEERING_REVIEW_2026-02-14.md`
2. Close PRs #21, #23, #24
3. Close PR #25 with comment explaining code was cherry-picked
