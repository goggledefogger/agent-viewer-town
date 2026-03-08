#!/bin/bash
# Output currently playing track from Music.app or Spotify
now_playing=$(osascript -e '
tell application "System Events"
    if (name of processes) contains "Music" then
        tell application "Music"
            if player state is playing then
                return (name of current track) & " - " & (artist of current track)
            end if
        end tell
    end if
    if (name of processes) contains "Spotify" then
        tell application "Spotify"
            if player state is playing then
                return (name of current track) & " - " & (artist of current track)
            end if
        end tell
    end if
end tell
return ""
' 2>/dev/null)

echo "${now_playing:--}"
