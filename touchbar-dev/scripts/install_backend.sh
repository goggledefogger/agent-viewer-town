#!/bin/bash
set -e

# Platform gate
if [ "$(uname)" != "Darwin" ]; then
    echo "Error: Touch Bar development requires macOS."
    exit 1
fi

BACKEND="${1}"

if [ -z "$BACKEND" ]; then
    echo "Error: Please specify 'mtmr' or 'btt'."
    echo "Usage: ./install_backend.sh <mtmr|btt>"
    exit 1
fi

if [ "$BACKEND" = "btt" ]; then
    echo "Installing BetterTouchTool..."
    if command -v brew &> /dev/null; then
        brew install --cask bettertouchtool
        echo "✅ BetterTouchTool installed."
        echo "⚠️ Note: BTT requires a $22 license after a 45-day trial."
    else
        echo "Error: Homebrew is required to install BetterTouchTool."
        exit 1
    fi
elif [ "$BACKEND" = "mtmr" ]; then
    echo "Installing MTMR..."
    
    # Try Homebrew first
    if command -v brew &> /dev/null; then
        if brew install --cask mtmr; then
            echo "✅ MTMR installed via Homebrew."
        else
            echo "Homebrew install failed (likely download server issue). Trying GitHub release directly..."
            # GitHub Release fallback
            curl -L -o /tmp/MTMR.dmg "https://github.com/Toxblh/MTMR/releases/download/v0.27/MTMR.0.27.dmg"
            hdiutil attach /tmp/MTMR.dmg -nobrowse -quiet
            cp -R /Volumes/MTMR*/MTMR.app /Applications/
            hdiutil detach /Volumes/MTMR* -quiet
            echo "✅ MTMR installed from GitHub."
        fi
    else
        # No Homebrew, use GitHub Release directly
        curl -L -o /tmp/MTMR.dmg "https://github.com/Toxblh/MTMR/releases/download/v0.27/MTMR.0.27.dmg"
        hdiutil attach /tmp/MTMR.dmg -nobrowse -quiet
        cp -R /Volumes/MTMR*/MTMR.app /Applications/
        hdiutil detach /Volumes/MTMR* -quiet
        echo "✅ MTMR installed from GitHub."
    fi
    
    echo ""
    echo "⚠️ CRITICAL SETUP REQUIRED ⚠️"
    echo "MTMR will not work without Accessibility permission."
    echo "1. Launch MTMR: open -a MTMR"
    echo "2. Open System Settings > Privacy & Security > Accessibility"
    echo "3. Find MTMR and enable the toggle (or click + and add /Applications/MTMR.app)"
    echo "4. Quit and relaunch MTMR"
else
    echo "Error: Unknown backend '$BACKEND'. Use 'mtmr' or 'btt'."
    exit 1
fi
