#!/bin/bash
# Touch Bar button script — reads agent-viewer-town waiting status.
# Returns formatted text for MTMR shellScriptTitledButton.

STATUS_FILE="/tmp/agent-viewer-touchbar.json"

if [ ! -f "$STATUS_FILE" ]; then
    echo "🤖 —"
    exit 0
fi

# Read the JSON status file
COUNT=$(python3 -c "import json,sys; d=json.load(open('$STATUS_FILE')); print(d.get('waitingCount',0))" 2>/dev/null)
if [ -z "$COUNT" ] || [ "$COUNT" = "0" ]; then
    echo "🤖 ✓"
    exit 0
fi

# Get first waiting agent name
NAME=$(python3 -c "import json; d=json.load(open('$STATUS_FILE')); a=d.get('agents',[]); print(a[0]['name'][:12] if a else '')" 2>/dev/null)

if [ "$COUNT" = "1" ]; then
    echo "⚠️ $NAME"
else
    echo "⚠️ ${COUNT} waiting"
fi
