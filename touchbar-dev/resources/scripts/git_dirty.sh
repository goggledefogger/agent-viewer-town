#!/bin/bash
# Output a marker if the working tree is dirty, or "ok" if clean
git rev-parse --is-inside-work-tree &>/dev/null || { echo "-"; exit 0; }
if git diff --quiet HEAD 2>/dev/null; then
    echo "ok"
else
    echo "**"
fi
