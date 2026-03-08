#!/bin/bash
# install-mac-app.sh — Compiles Launcher.applescript and adds it to the macOS Dock

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Agent Viewer Town"
APP_PATH="/Applications/${APP_NAME}.app"
TEMP_APPLESCRIPT="/tmp/Launcher.applescript"

echo "🚀 Preparing macOS App installation..."

# Find absolute path to npm
NPM_PATH=$(which npm)
if [ -z "$NPM_PATH" ]; then
    echo "❌ Error: npm is not found in PATH."
    exit 1
fi
echo "📍 Found npm at: $NPM_PATH"

# Find the directory where npm resides to add to PATH (usually ~/.nvm/versions/node/vx.x.x/bin)
NPM_DIR=$(dirname "$NPM_PATH")

START_SCRIPT_PATH="${APP_PATH}/Contents/Resources/start-dev.sh"

# Ensure AppleScript has the absolute path to the wrapper
sed "s|REPLACE_WITH_START_SCRIPT|${START_SCRIPT_PATH}|g" \
    "${REPO_DIR}/Launcher.applescript" > "$TEMP_APPLESCRIPT"

echo "📦 Compiling application to ${APP_PATH}..."
# Remove existing app if it exists
if [ -d "$APP_PATH" ]; then
    rm -rf "$APP_PATH"
fi

osacompile -o "$APP_PATH" "$TEMP_APPLESCRIPT"

echo "📝 Generating wrapper inside the application bundle..."
mkdir -p "${APP_PATH}/Contents/Resources"
cat > "$START_SCRIPT_PATH" << EOF
#!/bin/bash
APP_DIR="${REPO_DIR}"
EOF
cat >> "$START_SCRIPT_PATH" << 'EOF'

# Force all subshells to avoid zsh path_helper resetting $PATH
export SHELL=/bin/bash
export npm_config_script_shell=/bin/bash

# Try to load NVM if it exists
if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Fallback: load zshrc just in case nvm isn't standard
if ! command -v npm &> /dev/null; then
    source ~/.zshrc 2>/dev/null
fi

cd "$APP_DIR"
npm run dev > /tmp/agent-viewer-dev.log 2>&1 &
echo $! > /tmp/agent-viewer-dev.pid
EOF
chmod +x "$START_SCRIPT_PATH"

echo "⚙️ Configuring app to stay open (allows quitting from Dock)..."
defaults write "${APP_PATH}/Contents/Info.plist" OSAAppletStayOpen -bool YES

# Cleanup
rm "$TEMP_APPLESCRIPT"

echo "🧹 Cleaning up any existing '${APP_NAME}' Dock icons..."
python3 -c "
import plistlib
import os

plist_path = os.path.expanduser('~/Library/Preferences/com.apple.dock.plist')
try:
    with open(plist_path, 'rb') as fp:
        plist = plistlib.load(fp)
    
    original_count = len(plist.get('persistent-apps', []))
    plist['persistent-apps'] = [
        item for item in plist.get('persistent-apps', [])
        if item.get('tile-data', {}).get('file-label') != '${APP_NAME}'
    ]
    
    if len(plist['persistent-apps']) < original_count:
        with open(plist_path, 'wb') as fp:
            plistlib.dump(plist, fp)
        print('  -> Removed duplicate icons.')
except Exception as e:
    print(f'  -> Warning: Could not clean Dock preferences: {e}')
"

echo "⚓ Adding fresh icon to macOS Dock..."
defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://${APP_PATH}/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
echo "✅ Restarting Dock..."
killall Dock

echo ""
echo "✨ Installation complete!"
echo "You can now find '${APP_NAME}' in your Applications folder and on your Dock."
echo "Tapping it will start the dev server and open the viewer in your browser."
echo ""
