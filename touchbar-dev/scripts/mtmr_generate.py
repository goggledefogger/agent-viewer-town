"""Generate and deploy MTMR/BTT Touch Bar configurations."""

import argparse
import json
import os
import sys
from pathlib import Path

from helpers import (
    BACKUP_DIR,
    TEMPLATES_DIR,
    backup_file,
    get_mtmr_config_path,
    list_backups,
    resolve_script_path,
    validate_mtmr_config,
)


def detect_backend(args):
    """Determine which backend to use. Returns 'mtmr' or 'btt'."""
    if hasattr(args, "backend") and args.backend and args.backend != "auto":
        return args.backend

    # Auto-detect: prefer MTMR if both present
    from detect import check_mtmr_installed, check_btt_installed

    mtmr = check_mtmr_installed()
    btt = check_btt_installed()

    if mtmr["installed"]:
        return "mtmr"
    if btt["installed"]:
        return "btt"

    print("Error: No backend found. Install MTMR or BetterTouchTool.")
    sys.exit(1)


def load_template(name, backend):
    """Load a template file by name and backend type."""
    template_dir = TEMPLATES_DIR / backend
    template_path = template_dir / f"{name}.json"

    if not template_path.exists():
        available = [p.stem for p in template_dir.glob("*.json")]
        print(f"Error: Template '{name}' not found for backend '{backend}'.")
        print(f"Available templates: {', '.join(available)}")
        sys.exit(1)

    with open(template_path, "r") as f:
        return json.load(f)


def rewrite_script_paths(config):
    """Replace {{SCRIPTS_DIR}} placeholders with absolute paths."""
    from helpers import SCRIPTS_DIR

    text = json.dumps(config)
    scripts_dir = str(SCRIPTS_DIR.resolve())
    text = text.replace("{{SCRIPTS_DIR}}", scripts_dir)
    return json.loads(text)


def backup_current_config():
    """Backup the current MTMR config. Returns backup path or None."""
    config_path = get_mtmr_config_path()
    if config_path.exists():
        backup_path = backup_file(config_path)
        if backup_path:
            print(f"Backed up current config to: {backup_path.name}")
        return backup_path
    return None


def deploy_mtmr_config(config):
    """Write config to MTMR's items.json. MTMR auto-reloads on change."""
    config_path = get_mtmr_config_path()
    config_dir = config_path.parent
    config_dir.mkdir(parents=True, exist_ok=True)

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    print(f"Deployed config to: {config_path}")
    print("MTMR will auto-reload the new layout.")


def cmd_apply(args):
    """Apply a template to the Touch Bar."""
    if not args.template:
        print("Error: --template is required. Choose from: minimal, dev-dashboard,")
        print("  system-monitor, media-controls, pomodoro, git-status")
        sys.exit(1)

    backend = detect_backend(args)
    print(f"Using backend: {backend}")

    config = load_template(args.template, backend)

    if backend == "mtmr":
        config = rewrite_script_paths(config)
        ok, errors = validate_mtmr_config(config)
        if not ok:
            print("Error: Invalid template config:")
            for e in errors:
                print(f"  - {e}")
            sys.exit(1)

        backup_current_config()
        deploy_mtmr_config(config)
        print(f"Applied template: {args.template}")

    elif backend == "btt":
        # Rewrite script paths, write to temp file, then import
        import tempfile
        from btt_control import import_preset

        config = rewrite_script_paths(config)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as tmp:
            json.dump(config, tmp, indent=2)
            tmp_path = tmp.name

        backup_current_config()
        import_preset(tmp_path)
        os.unlink(tmp_path)
        print(f"Applied BTT template: {args.template}")


def cmd_restore(args):
    """Restore a previous config from backup."""
    backups = list_backups()

    if not backups:
        print("No backups found.")
        sys.exit(1)

    if hasattr(args, "backup_id") and args.backup_id:
        if args.backup_id == "latest":
            selected = backups[0]
        else:
            # Match by backup ID (timestamp portion)
            matches = [b for b in backups if args.backup_id in b.name]
            if not matches:
                print(f"Error: No backup matching '{args.backup_id}'.")
                print("Available backups:")
                for b in backups:
                    print(f"  {b.name}")
                sys.exit(1)
            selected = matches[0]
    else:
        # Default to latest
        selected = backups[0]

    config_path = get_mtmr_config_path()

    # Read backup content
    with open(selected, "r") as f:
        backup_config = json.load(f)

    # Write it back
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        json.dump(backup_config, f, indent=2)

    print(f"Restored config from: {selected.name}")
    print(f"Written to: {config_path}")


def main():
    parser = argparse.ArgumentParser(description="MTMR/BTT config generator")
    subparsers = parser.add_subparsers(dest="command")

    apply_parser = subparsers.add_parser("apply", help="Apply a template")
    apply_parser.add_argument("--template", required=True, help="Template name")
    apply_parser.add_argument("--backend", choices=["mtmr", "btt", "auto"],
                              default="auto", help="Backend to use")

    restore_parser = subparsers.add_parser("restore", help="Restore a backup")
    restore_parser.add_argument("--backup-id", default="latest",
                                help="Backup ID or 'latest'")

    args = parser.parse_args()

    if args.command == "apply":
        cmd_apply(args)
    elif args.command == "restore":
        cmd_restore(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
