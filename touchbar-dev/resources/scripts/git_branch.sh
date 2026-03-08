#!/bin/bash
# Output current git branch name, or "-" if not in a repo
branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
echo "${branch:--}"
