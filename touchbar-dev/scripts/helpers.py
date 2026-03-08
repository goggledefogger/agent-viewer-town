"""Shared utilities for Touch Bar development skill."""

import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent
CONFIG_PATH = SKILL_DIR / "config.json"
BACKUP_DIR = SKILL_DIR / "output" / "backups"
RESOURCES_DIR = SKILL_DIR / "resources"
TEMPLATES_DIR = RESOURCES_DIR / "templates"
SCRIPTS_DIR = RESOURCES_DIR / "scripts"


def load_config():
    """Load config.json with sensible defaults."""
    defaults = {
        "mtmr_config_path": "~/Library/Application Support/MTMR/items.json",
        "btt_port": 64472,
        "btt_shared_secret": "",
    }

    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r") as f:
                user_config = json.load(f)
            for key, value in user_config.items():
                if isinstance(value, dict) and isinstance(defaults.get(key), dict):
                    defaults[key].update(value)
                else:
                    defaults[key] = value
        except Exception as e:
            print(f"Warning: Could not load config.json: {e}")

    return defaults


def get_mtmr_config_path():
    """Return the expanded MTMR config file path."""
    config = load_config()
    return Path(os.path.expanduser(config["mtmr_config_path"]))


def backup_file(source, backup_dir=None):
    """Create a timestamped backup of a file. Returns backup path or None."""
    source = Path(source)
    if not source.exists():
        return None

    if backup_dir is None:
        backup_dir = BACKUP_DIR
    backup_dir = Path(backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{source.stem}_{timestamp}{source.suffix}"
    backup_path = backup_dir / backup_name
    shutil.copy2(source, backup_path)
    return backup_path


def list_backups(backup_dir=None):
    """List all backups sorted by date (newest first)."""
    if backup_dir is None:
        backup_dir = BACKUP_DIR
    backup_dir = Path(backup_dir)

    if not backup_dir.exists():
        return []

    backups = sorted(backup_dir.glob("items_*.json"), reverse=True)
    return backups


def validate_mtmr_config(config):
    """Validate an MTMR items.json structure. Returns (ok, errors)."""
    errors = []

    if not isinstance(config, list):
        return False, ["Config must be a JSON array"]

    for i, item in enumerate(config):
        if not isinstance(item, dict):
            errors.append(f"Item {i}: must be an object")
            continue
        if "type" not in item:
            errors.append(f"Item {i}: missing required 'type' field")

    return len(errors) == 0, errors


# Named color map
_COLOR_NAMES = {
    "red": "#FF0000",
    "green": "#00FF00",
    "blue": "#0000FF",
    "yellow": "#FFFF00",
    "orange": "#FF6600",
    "white": "#FFFFFF",
    "black": "#000000",
    "cyan": "#00FFFF",
    "magenta": "#FF00FF",
    "gray": "#808080",
    "grey": "#808080",
}


def parse_color(color_str):
    """Normalize a color string to hex format (#RRGGBB)."""
    if not color_str:
        return None

    color_str = color_str.strip().lower()

    # Named color
    if color_str in _COLOR_NAMES:
        return _COLOR_NAMES[color_str]

    # Already hex
    if re.match(r"^#[0-9a-f]{6}$", color_str):
        return color_str.upper()

    # Short hex
    if re.match(r"^#[0-9a-f]{3}$", color_str):
        r, g, b = color_str[1], color_str[2], color_str[3]
        return f"#{r}{r}{g}{g}{b}{b}".upper()

    # rgb(r, g, b)
    m = re.match(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", color_str)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"#{r:02X}{g:02X}{b:02X}"

    return color_str.upper()


def resolve_script_path(name):
    """Resolve a resource script name to its absolute path."""
    path = SCRIPTS_DIR / name
    if path.exists():
        return str(path.resolve())
    return str(path)
