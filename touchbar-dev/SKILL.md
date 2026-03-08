---
name: touchbar-dev
description: Develop custom Touch Bar UIs for MacBook Pro via MTMR or BetterTouchTool. Use to build dashboards, system monitors, or media controls.
---

# Touch Bar Developer Skill

Build and deploy custom Touch Bar layouts on MacBook Pro (2016–2022). Supports two backends: **MTMR** (My TouchBar My Rules — free, MIT, JSON config) and **BetterTouchTool** (commercial, rich API). Auto-detects which tools are installed and routes accordingly.

## Getting Started

**Always start with detection** to understand what hardware and tools the user has:

```bash
./touchbar-dev/run.sh detect
```

This shows a table of what's installed and prints actionable next steps. Walk the user through whatever it recommends.

### Installing a backend

### Installing a backend

The preferred and free backend is **MTMR**. Use the built-in command to install it reliably (handles download server fallbacks automatically):

```bash
./touchbar-dev/run.sh install mtmr
```

To install BetterTouchTool instead (requires $22 license after 45 days):
```bash
./touchbar-dev/run.sh install btt
```

**MTMR is an Intel app** — on Apple Silicon Macs (M1/M2/M3) it runs via Rosetta 2. If Rosetta isn't installed, macOS will prompt to install it on first launch, or install manually: `softwareupdate --install-rosetta --agree-to-license`

### After installing MTMR — required macOS permissions

MTMR **will not work** without Accessibility permission. This is the most common setup issue. Guide the user through:

1. Launch MTMR: `open -a MTMR`
2. Open **System Settings > Privacy & Security > Accessibility**
3. Find **MTMR** in the list and **enable** the toggle
4. If MTMR is not in the list, click **+**, navigate to `/Applications/MTMR.app`, and add it
5. **Quit and relaunch MTMR** after granting the permission

Without this step, MTMR runs in the menu bar but cannot replace the system Touch Bar. The user will see no change on their Touch Bar.

### If BTT is installed but API shows unavailable

BTT requires explicit opt-in for programmatic control:
1. Open BetterTouchTool
2. Go to **Preferences > Advanced Settings**
3. Enable **"Allow External Connections via btt:// URL Scheme"**
4. Optionally set a shared secret (update `config.json` if so)

### If no Touch Bar hardware is detected

The user may be on a Mac without a Touch Bar. Options:
- Use **Xcode's Touch Bar Simulator**: Xcode > Window > Show Touch Bar (requires Xcode installed)
- Configs can still be generated and tested later on a Touch Bar Mac

## Critical: MTMR config behavior

MTMR reads `~/Library/Application Support/MTMR/items.json` and watches it for changes via filesystem events.

**Important behavior discovered during testing:**
- When MTMR is **already running**, writing to `items.json` triggers an immediate auto-reload. This is the normal and correct workflow. The skill's `apply`, `demo`, and `restore` commands all work this way.
- When MTMR **launches**, it overwrites `items.json` with its cached in-memory state from the previous session. This means writing a config *before* launching MTMR will be overwritten on launch.
- **Always ensure MTMR is running before applying configs.** The skill handles this correctly — just make sure MTMR is open first.

## Usage

All commands go through `run.sh`:

```bash
# Detect installed backends and Touch Bar hardware
./touchbar-dev/run.sh detect

# Install a backend (mtmr or btt)
./touchbar-dev/run.sh install <mtmr|btt>

# Apply a template layout
./touchbar-dev/run.sh apply --template <name> [--backend mtmr|btt]

# Run a visual demo (Ctrl+C to stop and restore)
./touchbar-dev/run.sh demo <dashboard|solid-red|rainbow>

# Add a single widget (BTT only)
./touchbar-dev/run.sh add-widget --type <type> --title <title> [--script <path>]

# Restore a previous config from backup
./touchbar-dev/run.sh restore [--backup-id <id>|latest]
```

## Demos

Three built-in demos show what's possible. Each backs up the current config and restores it when stopped with Ctrl+C or SIGTERM.

| Demo | What it does |
|---|---|
| `dashboard` | Developer dashboard: Escape, git branch, CPU usage, battery, clock |
| `solid-red` | Fills the entire Touch Bar with solid red — demonstrates full-bar control |
| `rainbow` | Animated rainbow cycling across the bar — demonstrates live color animation |

```bash
# Try the rainbow animation
./touchbar-dev/run.sh demo rainbow
# Press Ctrl+C to stop — your previous config is automatically restored
```

## Templates

| Template | Description |
|---|---|
| `minimal` | Escape key + brightness + volume. Safe baseline. |
| `dev-dashboard` | Git branch, dirty status, CPU usage, battery, clock. |
| `system-monitor` | CPU, memory, battery, network stats. |
| `media-controls` | Now playing info, play/pause/skip buttons. |
| `pomodoro` | 25/5 minute timer with start/pause/reset. |
| `git-status` | Branch name, dirty flag, ahead/behind, stash count. |

## MTMR Quick Reference

**Item types:**
- Buttons: `escape`, `exitTouchbar`, `staticButton`, `close`
- Custom script: `shellScriptTitledButton`, `appleScriptTitledButton`
- Controls: `brightnessUp`, `brightnessDown`, `volumeUp`, `volumeDown`, `mute`, `illuminationUp`, `illuminationDown`
- Sliders: `brightness`, `volume`
- Info: `timeButton`, `battery`, `cpu`, `network`, `weather`, `yandexWeather`, `currency`, `upnext`
- Media: `music`, `previous`, `play`, `next`
- System: `dock`, `nightShift`, `dnd`, `darkMode`, `inputsource`, `pomodoro`, `sleep`, `displaySleep`
- Layout: `group` (container for sub-items, use `close` to end a group)

**Key properties:**
```json
{
  "type": "shellScriptTitledButton",
  "source": { "filePath": "/path/to/script.sh", "refreshInterval": 5 },
  "title": "Label",
  "action": "shellScript",
  "longAction": "shellScript",
  "actionAppleScript": { "inline": "..." },
  "image": { "base64": "..." },
  "width": 80,
  "align": "left",
  "background": "#FF6600",
  "bordered": false
}
```

**Script sources** can be `filePath`, `inline`, or `base64`. Shell scripts support ANSI color codes (16-color). AppleScript buttons can return `{"TITLE", "IMAGE_LABEL"}` to dynamically set icon and text.

**Gestures:** Two/three/four-finger swipes supported via the `swipe` type with `fingers`, `direction`, `minOffset` properties.

**Full-bar coloring:** Use a single `staticButton` with `"width": 9999` to fill the entire Touch Bar with one color.

**Community presets:** https://github.com/Toxblh/MTMR-presets — creative configs including crypto trackers, multi-bar layouts, gesture controls, and developer shortcuts.

## BTT Quick Reference

**bttcli** (command-line):
```bash
/usr/local/bin/bttcli update_touch_bar_widget "uuid-here" text "New Text"
/usr/local/bin/bttcli trigger_named "ActionName"
```

**URL scheme:**
```
btt://update_touch_bar_widget/?uuid=UUID&text=TEXT
btt://trigger_named/?trigger_name=NAME
```

**HTTP API** (default port 64472):
```bash
curl "http://127.0.0.1:64472/update_touch_bar_widget/?uuid=UUID&text=TEXT"
```

## Safety & Backups

Every `apply` and `demo` command automatically backs up the current config before writing. Backups are stored in `touchbar-dev/output/backups/` with timestamps. Use `restore` to roll back.

## Troubleshooting

| Issue | Fix |
|---|---|
| MTMR not appearing on Touch Bar | Grant Accessibility permission: System Settings > Privacy & Security > Accessibility > enable MTMR. This is the #1 setup issue. |
| Config reverts after MTMR restart | MTMR overwrites items.json on launch with its cached state. Always apply configs while MTMR is already running. |
| MTMR not reloading | Quit and reopen MTMR. Check items.json is valid JSON. |
| brew install mtmr fails | The mtmr.app download server is unreliable. Use the GitHub releases direct download instead (see Getting Started). |
| BTT widgets not updating | Ensure "Allow External Connections" is enabled in BTT preferences. |
| BTT trial expired | BTT requires purchase after 45 days. Switch to MTMR (free) instead. |
| Touch Bar blank after apply | Run `restore --backup-id latest` to roll back. |
| Scripts not executing | Check scripts are `chmod +x` and have correct shebangs (`#!/bin/bash`). |
| "No backend found" | Install MTMR or BTT first (see Getting Started). |

## Packaging for Claude

```bash
zip -r touchbar-dev.zip touchbar-dev/ \
  -x "*/.venv/*" "*/output/*" "*/__pycache__/*" "*/.DS_Store" "*/.env"
```
