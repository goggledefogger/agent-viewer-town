# Agent Viewer Town

A real-time animated visualization for Claude Code sessions and agent teams. Watch your agents work in a pixel-art workshop, with live activity tracking via Claude Code hooks.

## Features

- **Pixel-art SVG characters** - Each agent role is a different animal (Beaver, Owl, Fox, Bear, Rabbit)
- **Live activity tracking** - See what each agent is doing in real-time (editing files, running commands, searching, etc.)
- **Claude Code hooks integration** - First-class lifecycle events for instant, accurate state detection
- **Subagent differentiation** - Subagent type labels (Explore, Plan, Bash, etc.) for distinguishing parallel subagents
- **Session auto-detection** - Works with solo sessions and multi-agent teams
- **Git branch visibility** - Branch badges with push/pull status indicators per agent
- **Multi-tab support** - Each browser tab can watch a different session independently
- **Responsive design** - Mobile-friendly with collapsible sidebar
- **Evolution system** - Agents visually "level up" as they complete more tasks

## Quick Start

```bash
# Install dependencies
npm install

# Install Claude Code hooks (required for real-time activity detection)
npm run hooks:install

# Start both server and client
npm run dev
```

Then open **http://localhost:5173** in your browser.

The viewer will automatically detect active Claude Code sessions from `~/.claude/`.

## How It Works

### Two Detection Systems

**1. Hooks (primary)** - Claude Code lifecycle hooks send HTTP events to the viewer server for instant, accurate state detection:
- `PreToolUse`/`PostToolUse` - Real-time tool activity with rich descriptions
- `PermissionRequest` - Definitive "needs your input" signal
- `SubagentStart`/`SubagentStop` - Reliable subagent lifecycle with type tracking
- `Stop` - Agent finished responding
- `PreCompact` - Context compaction in progress
- Auto-registration: hooks create agents on-the-fly if the JSONL watcher hasn't detected them yet

Install hooks with `npm run hooks:install` (adds to `~/.claude/settings.json`).

**2. JSONL transcript parsing (fallback)** - Scans `~/.claude/projects/` for session transcripts. Provides session discovery and initial state on startup, and serves as a portable fallback for non-hook environments.

**Guard mechanisms** prevent stale agents:
- Removed-agent tracking blocks JSONL from re-registering subagents after hooks removed them
- Hook-active sessions are prioritized over JSONL updates
- Subagent deduplication prevents double-detection from concurrent sources

### What Gets Watched

- **Sessions**: `~/.claude/projects/{slug}/{sessionId}.jsonl`
- **Teams**: `~/.claude/teams/{team-name}/config.json`
- **Tasks**: `~/.claude/tasks/{team-name}/*.json`
- **Subagents**: `~/.claude/projects/{slug}/{sessionId}/subagents/*.jsonl`

### Git Status

The branch badge on each agent shows:
- Branch name with color coding (green for main, others hashed)
- `!` when the branch has no upstream (not pushed)
- `↑N` for unpushed commits, `↓N` for commits behind remote
- Orange border when the working tree is dirty

Click an agent to see the full detail popover with push/pull status.

## Architecture

```
agent-viewer-town/
├── packages/
│   ├── shared/          # TypeScript types shared between server & client
│   ├── server/          # Express + WebSocket + Chokidar file watcher + hooks handler
│   └── client/          # Vite + React frontend with SVG animations
├── hooks/               # Claude Code hook script + installer
```

- **Server** (port 3001): Watches `~/.claude/`, processes hook events, broadcasts state via WebSocket
- **Client** (port 5173): React app with animated SVG scene, session picker, and sidebar

## Development

```bash
# Run tests (342 tests)
npx vitest run --config packages/server/vitest.config.ts

# Type check
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/client/tsconfig.json

# Build for production
npm run build

# Run server only
npm run dev -w packages/server

# Run client only
npm run dev -w packages/client
```

## Visual Design

**Theme**: "The Workshop in the Woods" - A cozy woodland clearing where animal engineers operate an Incredible Machine-style contraption.

**Agent Roles**:
| Role | Animal | Color |
|------|--------|-------|
| Lead | Beaver | Gold |
| Researcher | Owl | Blue |
| Implementer | Fox | Red |
| Tester | Bear | Green |
| Planner | Rabbit | White |

**Evolution Stages**:
- **Stage 1** (0 tasks): Basic character
- **Stage 2** (3+ tasks): Glowing outline
- **Stage 3** (6+ tasks): Fully evolved with particle effects

## Tech Stack

- **Monorepo**: NPM workspaces
- **Server**: Express 5 + ws (WebSocket) + Chokidar 4 (file watching)
- **Client**: Vite 7 + React 19
- **Graphics**: Inline SVG with CSS animations
- **Testing**: Vitest

## Repository

- **Default branch**: `main`
- **GitHub**: https://github.com/goggledefogger/agent-viewer-town

## License

MIT

---

Built with Claude Code agent teams
