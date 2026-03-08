#!/bin/bash
# Output current CPU usage percentage
top -l 1 -n 0 2>/dev/null | awk '/CPU usage/ {print $3}' || echo "-"
