#!/bin/bash
# Pomodoro timer display — reads state from /tmp/touchbar-pomodoro-state
STATE_FILE="/tmp/touchbar-pomodoro-state"
CMD_FILE="/tmp/touchbar-pomodoro-state.cmd"
WORK_SECONDS=1500  # 25 minutes
BREAK_SECONDS=300  # 5 minutes

# Handle commands
if [ -f "$CMD_FILE" ]; then
    CMD=$(cat "$CMD_FILE")
    rm -f "$CMD_FILE"
    case "$CMD" in
        start)
            echo "running $(date +%s) $WORK_SECONDS" > "$STATE_FILE"
            ;;
        pause)
            if [ -f "$STATE_FILE" ]; then
                read -r status start_time remaining < "$STATE_FILE"
                if [ "$status" = "running" ]; then
                    now=$(date +%s)
                    elapsed=$((now - start_time))
                    left=$((remaining - elapsed))
                    [ "$left" -lt 0 ] && left=0
                    echo "paused 0 $left" > "$STATE_FILE"
                fi
            fi
            ;;
    esac
fi

# Display current state
if [ ! -f "$STATE_FILE" ]; then
    echo "25:00"
    exit 0
fi

read -r status start_time remaining < "$STATE_FILE"

case "$status" in
    running)
        now=$(date +%s)
        elapsed=$((now - start_time))
        left=$((remaining - elapsed))
        if [ "$left" -le 0 ]; then
            # Timer done — switch to break or signal
            echo "DONE!"
            rm -f "$STATE_FILE"
        else
            mins=$((left / 60))
            secs=$((left % 60))
            printf "%02d:%02d\n" "$mins" "$secs"
        fi
        ;;
    paused)
        left=$remaining
        mins=$((left / 60))
        secs=$((left % 60))
        printf "||%02d:%02d\n" "$mins" "$secs"
        ;;
    *)
        echo "25:00"
        ;;
esac
