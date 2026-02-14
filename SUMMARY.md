# Agent Viewer Town - Project Summary

## Project Status: Active Development

Real-time visualization for Claude Code sessions and agent teams.

**Repository**: https://github.com/goggledefogger/agent-viewer-town

---

## What's Working

### Core Functionality
- Real-time file watching of `~/.claude/` directory (Chokidar 4)
- Claude Code hooks integration for instant activity detection
- JSONL transcript parsing as portable fallback
- WebSocket server with per-client session filtering (multi-tab support)
- Session auto-detection (solo sessions and teams)
- Team detection, agent management, and task tracking
- Git branch/worktree detection with push/pull status indicators
- Subagent type differentiation (Explore, Plan, Bash, etc.) in status line and action bubbles
- Hooks auto-registration for sessions not yet detected by JSONL watcher
- Guard mechanisms preventing stale subagent re-registration

### Visual Features
- 5 SVG pixel-art animal characters (Beaver, Owl, Fox, Bear, Rabbit)
- 3-stage evolution system (tasks completed = visual upgrades)
- Animated workstations with gears, pipes, conveyor belts
- Steam puffs and spark bursts when working
- Action bubbles showing what each agent is doing
- Waiting-for-input alert with pulsing highlight
- Subagent tether lines with energy pulse animations
- Git branch badges with push status (ahead/behind/dirty indicators)
- Branch lanes in ground area with tether lines to agents

### UI Components
- Responsive sidebar (collapsible on mobile)
- Session picker for switching between sessions
- Agent detail popover (click to expand)
- Task board with status tracking
- Message log
- Connection status indicator

---

## Testing & Quality

- **382 passing tests** (parser: 86, state: 121, hooks: 126, server: 9, client: 40)
- Type-checked with TypeScript strict mode
- All packages compile cleanly

---

## State Detection Architecture

Two complementary systems:

**Hooks (primary)** - Claude Code lifecycle hooks send HTTP POST events:
- `PreToolUse`/`PostToolUse` - tool activity with rich action descriptions
- `PermissionRequest` - definitive "needs input" signal
- `SubagentStart`/`SubagentStop` - reliable subagent lifecycle with type tracking
- `Stop` - agent finished, transition to idle
- `PreCompact` - context compaction started
- Auto-registration for sessions not yet detected by JSONL watcher

**JSONL transcript parsing (fallback)** - file watcher reads transcripts:
- Session discovery on startup
- Initial state from transcript tail
- Activity display from tool_call/thinking events
- `turn_duration` detection for accurate idle state on restart
- Subagent deduplication via `registeredSubagents` Set

**Guard mechanisms** - prevent stale agent state:
- `removedAgents` Map blocks JSONL re-registration after hook-driven removal
- `hookActiveSessions` Map prioritizes hook updates over JSONL
- `stoppedSessions` Set prevents trailing JSONL from overriding Stop events

Key rule: No timeouts should change agent state. Only real events trigger transitions.

---

## How to Use

### Start the Viewer
```bash
npm install
npm run hooks:install  # Install Claude Code lifecycle hooks
npm run dev
```
Open **http://localhost:5173**

### With Solo Sessions
Just start Claude Code anywhere - the viewer auto-detects the session.

### With Agent Teams
```bash
claude  # Start a Claude Code session
```
Ask Claude to create a team and the viewer will show all agents, tasks, and messages.

---

## Server Architecture

Hook event processing is split into focused modules:
- `hooks/types.ts` — Event interfaces and shared types
- `hooks/describeAction.ts` — Human-readable tool action formatting
- `hooks/subagents.ts` — SubagentStart/Stop lifecycle + FIFO spawn matching
- `hooks/teamTools.ts` — TeamCreate/Delete, Task/Message extraction
- `hooks/index.ts` — Orchestrator with auto-registration and activity handlers

Session membership is centralized in `state.ts` via `getAgentsForSession()` — the single source of truth for which agents belong to a session.

---

## Tech Stack

- **Monorepo**: NPM workspaces (shared, server, client)
- **Server**: Express 5 + ws + Chokidar 4
- **Client**: Vite 7 + React 19
- **Testing**: Vitest
- **Language**: TypeScript 5.9

---

Built with Claude Code agent teams.
