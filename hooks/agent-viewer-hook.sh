#!/bin/bash
# Agent Viewer Town - Claude Code Lifecycle Hook
#
# This hook reads event JSON from stdin and POSTs it to the
# agent-viewer-town server for real-time visualization.
#
# Install by adding to ~/.claude/settings.json or .claude/settings.json:
#   See: npm run hooks:install
#
# Requirements:
# - curl must be available
# - Server must be running on localhost:3001
#
# Safety:
# - Always exits 0 (never blocks Claude)
# - Silent (no stdout/stderr that could corrupt Claude's conversation)
# - Fast (1s timeout for HTTP request)

PORT="${AGENT_VIEWER_PORT:-3001}"
INPUT=$(cat)

# Build curl arguments
CURL_ARGS=(-sS -X POST "http://127.0.0.1:${PORT}/api/hook" -H "Content-Type: application/json")

if [ -n "$AGENT_VIEWER_TOKEN" ]; then
  CURL_ARGS+=(-H "Authorization: Bearer $AGENT_VIEWER_TOKEN")
fi

CURL_ARGS+=(-d "$INPUT" --max-time 1)

# Fire-and-forget POST to the server
curl "${CURL_ARGS[@]}" >/dev/null 2>&1 || true

exit 0
