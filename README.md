# Agent Viewer Town 🏭

A real-time animated visualization for Claude Code agent teams. Watch your agents work together in a charming pixel-art workshop, inspired by The Incredible Machine.

![Agent Viewer Town](docs/screenshot-placeholder.png)

## Features

- 🎨 **Pixel-art SVG characters** - Each agent role is a different animal (Beaver, Owl, Fox, Bear, Rabbit)
- ⚙️ **Live animations** - Gears spinning, pipes flowing, steam puffs when agents work
- 📊 **Real-time task board** - See task status, dependencies, and assignments update live
- 💬 **Message stream** - Watch agents communicate in real-time
- 🔄 **WebSocket sync** - Instant updates as agents work
- 🎮 **Evolution system** - Agents visually "level up" as they complete more tasks

## Quick Start

```bash
# Install dependencies
npm install

# Start both server and client
npm run dev
```

Then open **http://localhost:5173** in your browser.

The viewer will automatically detect Claude Code teams and tasks in `~/.claude/`.

## How It Works

The server watches your `~/.claude/` directory for:
- **Teams**: `~/.claude/teams/{team-name}/config.json`
- **Tasks**: `~/.claude/tasks/{team-name}/*.json`
- **Transcripts**: `~/.claude/projects/{slug}/{sessionId}.jsonl` (for agent activity)

When you create a team using Claude Code's `TeamCreate` tool, the viewer picks it up and renders:
- Animal characters at workstations (one per agent)
- Pipes and conveyor belts connecting agents
- Task cards in the sidebar
- Animated data packets flowing when messages are sent

## Testing with Demo Data

If you don't have an active Claude Code team, the repo includes a demo team:

```bash
# The demo team is already created at ~/.claude/teams/demo-team
# Just start the dev server and visit http://localhost:5173
npm run dev
```

You'll see 3 agents (team-lead, researcher, implementer) and 3 tasks.

## Creating a Real Team

In a separate terminal, start a Claude Code session:

```bash
cd ~/your-project
claude
```

Then ask Claude to create a team:

```
Create a team called "my-test-team" with 2 agents (researcher and implementer).
Create 3-4 tasks for them to work on.
```

The viewer will immediately show the new team, agents appearing at workstations, and tasks populating the sidebar.

## Architecture

```
agent-viewer-town/
├── packages/
│   ├── shared/          # TypeScript types shared between server & client
│   ├── server/          # Express + WebSocket + Chokidar file watcher
│   └── client/          # Vite + React frontend with SVG animations
```

- **Server** (port 3001): Watches `~/.claude/` and broadcasts state via WebSocket
- **Client** (port 5173): React app with animated SVG scene and sidebar

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical details.

## Visual Design

**Theme**: "The Workshop in the Woods" - A cozy woodland clearing where animal engineers operate an Incredible Machine-style contraption.

**Agent Roles**:
| Role | Animal | Workstation | Color |
|------|--------|-------------|-------|
| Lead | 🦫 Beaver | Control desk with levers | Gold |
| Researcher | 🦉 Owl | Treehouse with telescope | Blue |
| Implementer | 🦊 Fox | Workbench with tools | Red |
| Tester | 🐻 Bear | Quality control anvil | Green |
| Planner | 🐰 Rabbit | Blueprint drafting table | White |

**Evolution Stages**:
- **Stage 1** (0 tasks): Basic character
- **Stage 2** (3+ tasks): Glowing outline + accessory
- **Stage 3** (6+ tasks): Fully evolved with particle effects

See [DESIGN.md](DESIGN.md) for the full visual system.

## Development

```bash
# Run tests
npm test

# Build for production
npm run build

# Run server only
npm run dev -w packages/server

# Run client only
npm run dev -w packages/client
```

## Tech Stack

- **Monorepo**: NPM workspaces
- **Server**: Express 5 + ws (WebSocket) + Chokidar 4 (file watching)
- **Client**: Vite 7 + React 19
- **Graphics**: Inline SVG with CSS animations
- **Testing**: Vitest (unit) + Playwright (E2E)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

---

Built with Claude Code agent teams 🤖
