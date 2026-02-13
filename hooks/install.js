#!/usr/bin/env node
/**
 * Install Agent Viewer Town hooks into Claude Code settings.
 *
 * Usage:
 *   node hooks/install.js           # Install hooks
 *   node hooks/install.js --uninstall  # Remove hooks
 *   npm run hooks:install           # Via npm script
 *   npm run hooks:uninstall         # Via npm script
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_SCRIPT = path.resolve(__dirname, 'agent-viewer-hook.sh');
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'Stop',
  'SessionStart',
  'SessionEnd',
  'TeammateIdle',
  'TaskCompleted',
  'UserPromptSubmit',
];

const uninstall = process.argv.includes('--uninstall');

// Read existing settings
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
} catch {
  if (uninstall) {
    console.log('No settings file found. Nothing to uninstall.');
    process.exit(0);
  }
  // Create the directory if needed
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
}

if (!settings.hooks) settings.hooks = {};

if (uninstall) {
  let removed = 0;
  for (const event of HOOK_EVENTS) {
    const entries = settings.hooks[event];
    if (!Array.isArray(entries)) continue;

    const filtered = entries.filter((entry) => {
      const hooks = entry.hooks || [];
      const cleaned = hooks.filter((h) => !h.command?.includes('agent-viewer-hook'));
      if (cleaned.length !== hooks.length) {
        removed++;
        entry.hooks = cleaned;
      }
      return entry.hooks.length > 0;
    });

    if (filtered.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = filtered;
    }
  }

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
  console.log(removed > 0
    ? `Removed ${removed} Agent Viewer Town hooks from ${SETTINGS_FILE}`
    : 'No Agent Viewer Town hooks found to remove.');
} else {
  // Install
  const added = [];

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Check if already installed
    const alreadyInstalled = settings.hooks[event].some((entry) =>
      (entry.hooks || []).some((h) => h.command?.includes('agent-viewer-hook'))
    );

    if (!alreadyInstalled) {
      settings.hooks[event].push({
        hooks: [{ type: 'command', command: HOOK_SCRIPT }],
      });
      added.push(event);
    }
  }

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');

  if (added.length > 0) {
    console.log(`Installed hooks for: ${added.join(', ')}`);
  } else {
    console.log('All hooks already installed.');
  }
  console.log(`Settings file: ${SETTINGS_FILE}`);
  console.log(`Hook script: ${HOOK_SCRIPT}`);
  console.log('\nAgent Viewer Town will now receive real-time events from Claude Code!');
  console.log('To uninstall: npm run hooks:uninstall');
}
