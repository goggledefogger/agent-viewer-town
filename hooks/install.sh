#!/bin/bash
# Install Agent Viewer Town hooks into Claude Code settings.
#
# This script adds lifecycle hooks to ~/.claude/settings.json
# so that Claude Code sends real-time events to the viewer.
#
# Usage: ./hooks/install.sh [--uninstall]

set -e

HOOK_SCRIPT="$(cd "$(dirname "$0")" && pwd)/agent-viewer-hook.sh"
SETTINGS_FILE="$HOME/.claude/settings.json"

# All the events we want to hook into
HOOK_EVENTS=(
  "PreToolUse"
  "PostToolUse"
  "PermissionRequest"
  "SubagentStart"
  "SubagentStop"
  "PreCompact"
  "Stop"
  "SessionStart"
  "SessionEnd"
)

# Check dependencies
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required for JSON manipulation"
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "Error: curl is required for the hook to communicate with the server"
  exit 1
fi

if [ ! -f "$HOOK_SCRIPT" ]; then
  echo "Error: Hook script not found at $HOOK_SCRIPT"
  exit 1
fi

chmod +x "$HOOK_SCRIPT"

# Uninstall mode
if [ "$1" = "--uninstall" ]; then
  if [ ! -f "$SETTINGS_FILE" ]; then
    echo "No settings file found at $SETTINGS_FILE"
    exit 0
  fi

  python3 -c "
import json, sys

with open('$SETTINGS_FILE', 'r') as f:
    settings = json.load(f)

hooks = settings.get('hooks', {})
changed = False
for event in ${HOOK_EVENTS[@]+"$(printf "'%s'," "${HOOK_EVENTS[@]}" | sed 's/,$//')".split(',')]:
    event = event.strip().strip(\"'\")
    if event in hooks:
        # Remove entries that reference our hook script
        entries = hooks[event]
        if isinstance(entries, list):
            filtered = []
            for entry in entries:
                hook_list = entry.get('hooks', [])
                hook_list = [h for h in hook_list if 'agent-viewer-hook' not in h.get('command', '')]
                if hook_list:
                    entry['hooks'] = hook_list
                    filtered.append(entry)
            if len(filtered) != len(entries):
                changed = True
                if filtered:
                    hooks[event] = filtered
                else:
                    del hooks[event]

if changed:
    settings['hooks'] = hooks
    with open('$SETTINGS_FILE', 'w') as f:
        json.dump(settings, f, indent=2)
    print('Agent Viewer Town hooks removed from $SETTINGS_FILE')
else:
    print('No Agent Viewer Town hooks found to remove')
"
  exit 0
fi

# Install mode
mkdir -p "$(dirname "$SETTINGS_FILE")"

# Create settings file if it doesn't exist
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

python3 << 'PYEOF'
import json

SETTINGS_FILE = "$SETTINGS_FILE"
HOOK_SCRIPT = "$HOOK_SCRIPT"
HOOK_EVENTS = $( printf '['; for e in "${HOOK_EVENTS[@]}"; do printf '"%s",' "$e"; done | sed 's/,$//'; printf ']' )

with open(SETTINGS_FILE, 'r') as f:
    settings = json.load(f)

if 'hooks' not in settings:
    settings['hooks'] = {}

hooks = settings['hooks']
added = []

for event in HOOK_EVENTS:
    hook_entry = {
        "hooks": [
            {
                "type": "command",
                "command": HOOK_SCRIPT
            }
        ]
    }

    if event not in hooks:
        hooks[event] = [hook_entry]
        added.append(event)
    else:
        # Check if our hook is already installed
        already_installed = False
        for entry in hooks[event]:
            for h in entry.get('hooks', []):
                if 'agent-viewer-hook' in h.get('command', ''):
                    already_installed = True
                    break
        if not already_installed:
            hooks[event].append(hook_entry)
            added.append(event)

settings['hooks'] = hooks
with open(SETTINGS_FILE, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

if added:
    print(f"Installed hooks for: {', '.join(added)}")
else:
    print("All hooks already installed")
print(f"Settings file: {SETTINGS_FILE}")
PYEOF

echo ""
echo "Agent Viewer Town hooks installed!"
echo "Hook script: $HOOK_SCRIPT"
echo ""
echo "To uninstall: $0 --uninstall"
