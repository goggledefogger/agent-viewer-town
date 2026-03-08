"""Touch Bar demo modes — visual examples of what's possible."""

import argparse
import atexit
import json
import sys
import time

from helpers import SCRIPTS_DIR, backup_file, get_mtmr_config_path

# Global state for cleanup
_backup_path = None
_config_path = None
_restored = False


def deploy(config):
    """Write config to MTMR items.json."""
    path = get_mtmr_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(config, f, indent=2)


def restore():
    """Restore the backed-up config. Only runs once."""
    global _restored
    if _restored:
        return
    _restored = True
    if _backup_path and _backup_path.exists():
        try:
            with open(_backup_path, "r") as f:
                original = json.load(f)
            deploy(original)
            print("\nRestored previous Touch Bar config.")
        except Exception:
            print(f"\nRestore failed. Manual restore: cp {_backup_path} '{_config_path}'")


def demo_dashboard():
    """Demo 1: Developer dashboard with git branch, CPU, battery, clock."""
    scripts = str(SCRIPTS_DIR.resolve())
    config = [
        {"type": "escape", "width": 64, "align": "left"},
        {
            "type": "shellScriptTitledButton",
            "source": {"filePath": f"{scripts}/git_branch.sh", "refreshInterval": 5},
            "title": "branch",
            "width": 120,
            "bordered": False,
            "background": "#1A1A2E",
        },
        {
            "type": "shellScriptTitledButton",
            "source": {"filePath": f"{scripts}/cpu_usage.sh", "refreshInterval": 3},
            "title": "CPU",
            "width": 80,
            "bordered": False,
            "background": "#16213E",
        },
        {"type": "battery", "align": "right"},
        {
            "type": "timeButton",
            "formatTemplate": "HH:mm",
            "align": "right",
            "width": 64,
        },
    ]
    deploy(config)
    print("Demo: Developer Dashboard")
    print("  Shows: Escape | Git branch | CPU usage | Battery | Clock")
    print("  Press Ctrl+C to stop and restore.")


def demo_solid_red():
    """Demo 2: Entire Touch Bar solid red."""
    config = [
        {
            "type": "staticButton",
            "title": " ",
            "background": "#FF0000",
            "bordered": False,
            "width": 9999,
            "align": "left",
        }
    ]
    deploy(config)
    print("Demo: Solid Red")
    print("  The entire Touch Bar is now red.")
    print("  Press Ctrl+C to stop and restore.")


def demo_rainbow():
    """Demo 3: Rainbow color animation cycling across the Touch Bar."""
    print("Demo: Rainbow Animation")
    print("  Cycling colors across the Touch Bar...")
    print("  Press Ctrl+C to stop and restore.")

    rainbow = [
        "#FF0000", "#FF6600", "#FFCC00", "#99FF00",
        "#00FF00", "#00FF99", "#00CCFF", "#0066FF",
        "#0000FF", "#6600FF", "#CC00FF", "#FF0099",
    ]

    frame = 0
    while True:
        items = []
        for i in range(6):
            color_idx = (frame + i * 2) % len(rainbow)
            items.append({
                "type": "staticButton",
                "title": " ",
                "background": rainbow[color_idx],
                "bordered": False,
                "width": 200,
            })
        deploy(items)
        frame += 1
        time.sleep(0.3)


def main():
    global _backup_path, _config_path

    parser = argparse.ArgumentParser(description="Touch Bar demos")
    parser.add_argument(
        "mode",
        choices=["dashboard", "solid-red", "rainbow"],
        help="Demo mode to run",
    )
    args = parser.parse_args()

    # Backup current config before any demo
    _config_path = get_mtmr_config_path()
    _backup_path = backup_file(_config_path)
    if _backup_path:
        print(f"Backed up current config to: {_backup_path.name}")

    # Register restore on normal exit
    atexit.register(restore)

    # Also handle SIGTERM explicitly (atexit doesn't run on signals)
    import signal

    def _signal_handler(sig, frame):
        restore()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _signal_handler)

    try:
        if args.mode == "dashboard":
            demo_dashboard()
            while True:
                time.sleep(1)
        elif args.mode == "solid-red":
            demo_solid_red()
            while True:
                time.sleep(1)
        elif args.mode == "rainbow":
            demo_rainbow()
    except KeyboardInterrupt:
        restore()
        sys.exit(0)


if __name__ == "__main__":
    main()
