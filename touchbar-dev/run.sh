#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Platform gate — Touch Bar is macOS only
if [ "$(uname)" != "Darwin" ]; then
    echo "Error: Touch Bar development requires macOS."
    exit 1
fi

mkdir -p output/backups

# Python venv setup — uv first, fallback to standard venv
if command -v uv &> /dev/null; then
    uv venv .venv --allow-existing -q
    uv pip install -r requirements.txt -q
    PYTHON=".venv/bin/python"
else
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    .venv/bin/pip install -r requirements.txt -q
    PYTHON=".venv/bin/python"
fi

COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
    detect)
        "$PYTHON" scripts/detect.py "$@"
        ;;
    install)
        bash scripts/install_backend.sh "$@"
        ;;
    apply)
        "$PYTHON" scripts/mtmr_generate.py apply "$@"
        ;;
    add-widget)
        "$PYTHON" scripts/btt_control.py add-widget "$@"
        ;;
    restore)
        "$PYTHON" scripts/mtmr_generate.py restore "$@"
        ;;
    demo)
        "$PYTHON" scripts/demo.py "$@" || true
        ;;
    agent-notify)
        # Apply the agent-notifications template for Agent Viewer Town integration
        "$PYTHON" scripts/mtmr_generate.py apply --template agent-notifications "$@"
        echo ""
        echo "Touch Bar now shows agent waiting status!"
        echo "The button polls /tmp/agent-viewer-touchbar.json every 2 seconds."
        echo "Tap the button to bring Agent Viewer Town to the front."
        echo ""
        echo "To restore your previous Touch Bar: run.sh restore"
        ;;
    help|--help|-h)
        echo "Touch Bar Developer — Custom Touch Bar UIs"
        echo ""
        echo "Usage: run.sh <command> [options]"
        echo ""
        echo "Commands:"
        echo "  detect              Detect installed backends and Touch Bar hardware"
        echo "  install             Install a backend"
        echo "    BACKEND           mtmr or btt"
        echo "  apply               Apply a template layout"
        echo "    --template NAME   Template name (minimal, dev-dashboard, system-monitor,"
        echo "                      media-controls, pomodoro, git-status)"
        echo "    --backend TYPE    Force backend (mtmr or btt). Default: auto-detect"
        echo "  add-widget          Add a single BTT widget"
        echo "    --type TYPE       Widget type"
        echo "    --title TITLE     Widget title text"
        echo "    --script PATH     Script to run for widget content"
        echo "  agent-notify        Install Agent Viewer Town notification widget"
        echo "  restore             Restore a previous config backup"
        echo "    --backup-id ID    Backup ID or 'latest'"
        echo "  demo                Run a visual demo (Ctrl+C to stop and restore)"
        echo "    MODE              dashboard | solid-red | rainbow"
        echo ""
        echo "Templates: minimal, dev-dashboard, system-monitor, media-controls, pomodoro, git-status"
        ;;
    *)
        echo "Error: Unknown command '$COMMAND'. Run with 'help' for usage."
        exit 1
        ;;
esac
