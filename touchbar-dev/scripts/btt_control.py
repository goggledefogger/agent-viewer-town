"""BetterTouchTool Touch Bar widget management."""

import argparse
import json
import subprocess
import sys
import urllib.parse
import uuid
from pathlib import Path

from helpers import TEMPLATES_DIR, load_config


def get_btt_connection():
    """Detect the best BTT connection method. Returns dict with type and details."""
    # Try bttcli first
    cli_path = Path("/usr/local/bin/bttcli")
    if cli_path.exists():
        return {"type": "cli", "path": str(cli_path)}

    # Try HTTP API
    config = load_config()
    port = config.get("btt_port", 64472)
    secret = config.get("btt_shared_secret", "")

    try:
        import urllib.request

        url = f"http://127.0.0.1:{port}/status/"
        if secret:
            url += f"?shared_secret={secret}"
        req = urllib.request.urlopen(url, timeout=2)
        if req.status == 200:
            return {"type": "http", "port": port, "secret": secret}
    except Exception:
        pass

    # Try URL scheme (always available if BTT is running)
    return {"type": "url_scheme"}


def btt_command(connection, endpoint, params=None):
    """Execute a BTT command via the detected connection method."""
    if params is None:
        params = {}

    config = load_config()
    secret = config.get("btt_shared_secret", "")
    if secret:
        params["shared_secret"] = secret

    if connection["type"] == "cli":
        cli = connection["path"]
        args = [cli, endpoint]
        for k, v in params.items():
            args.extend([k, str(v)])
        result = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return result.stdout.strip()

    elif connection["type"] == "http":
        import urllib.request

        port = connection["port"]
        query = urllib.parse.urlencode(params) if params else ""
        url = f"http://127.0.0.1:{port}/{endpoint}/"
        if query:
            url += f"?{query}"
        try:
            req = urllib.request.urlopen(url, timeout=5)
            return req.read().decode()
        except Exception as e:
            print(f"BTT HTTP API error: {e}")
            return None

    elif connection["type"] == "url_scheme":
        query = urllib.parse.urlencode(params) if params else ""
        url = f"btt://{endpoint}/"
        if query:
            url += f"?{query}"
        subprocess.run(["open", url], timeout=5)
        return "OK (via URL scheme)"


def import_preset(path):
    """Import a BTT preset file."""
    path = Path(path)
    if not path.exists():
        print(f"Error: Preset file not found: {path}")
        sys.exit(1)

    conn = get_btt_connection()

    if conn["type"] == "cli":
        result = subprocess.run(
            [conn["path"], "import_preset", str(path)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            print(f"Imported preset: {path.name}")
        else:
            print(f"Error importing preset: {result.stderr}")
    else:
        # Use URL scheme as fallback
        abs_path = str(path.resolve())
        encoded = urllib.parse.quote(abs_path)
        subprocess.run(["open", f"btt://import_preset/?path={encoded}"], timeout=5)
        print(f"Imported preset via URL scheme: {path.name}")


def export_preset(path):
    """Export current BTT config to a preset file."""
    conn = get_btt_connection()
    path = Path(path)

    if conn["type"] == "cli":
        result = subprocess.run(
            [conn["path"], "export_preset", str(path)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            print(f"Exported preset to: {path}")
        else:
            print(f"Error exporting: {result.stderr}")
    else:
        print("Export requires bttcli. Install via BTT preferences.")


def add_widget(args):
    """Add a new Touch Bar widget via BTT."""
    conn = get_btt_connection()
    widget_uuid = str(uuid.uuid4()).upper()

    widget_config = {
        "BTTTriggerType": 630,  # Touch Bar widget
        "BTTTriggerClass": "BTTTriggerTypeTouchBar",
        "BTTUUID": widget_uuid,
        "BTTEnabled": 1,
        "BTTTouchBarButtonName": args.title,
        "BTTTouchBarItemIconType": 1,
    }

    if hasattr(args, "script") and args.script:
        widget_config["BTTTouchBarShellScriptString"] = args.script
        widget_config["BTTTouchBarScriptUpdateInterval"] = 5

    json_str = json.dumps(widget_config)
    result = btt_command(conn, "add_new_trigger", {"json": json_str})

    print(f"Added widget: {args.title} (UUID: {widget_uuid})")
    if result:
        print(f"Response: {result}")

    return widget_uuid


def update_widget(widget_uuid, text):
    """Update a widget's display text."""
    conn = get_btt_connection()
    btt_command(conn, "update_touch_bar_widget", {"uuid": widget_uuid, "text": text})


def delete_widget(widget_uuid):
    """Delete a widget by UUID."""
    conn = get_btt_connection()
    btt_command(conn, "delete_trigger", {"uuid": widget_uuid})
    print(f"Deleted widget: {widget_uuid}")


def list_widgets():
    """List current Touch Bar widgets."""
    conn = get_btt_connection()

    if conn["type"] == "cli":
        result = subprocess.run(
            [conn["path"], "get_triggers"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            try:
                from rich.console import Console
                from rich.table import Table

                triggers = json.loads(result.stdout)
                console = Console()
                table = Table(title="BTT Touch Bar Widgets")
                table.add_column("Name", style="cyan")
                table.add_column("UUID")
                table.add_column("Enabled")

                for t in triggers:
                    if t.get("BTTTriggerClass") == "BTTTriggerTypeTouchBar":
                        name = t.get("BTTTouchBarButtonName", "(unnamed)")
                        uid = t.get("BTTUUID", "-")
                        enabled = "Yes" if t.get("BTTEnabled") else "No"
                        table.add_row(name, uid, enabled)

                console.print(table)
            except (json.JSONDecodeError, ImportError):
                print(result.stdout)
        else:
            print("No widgets found or unable to query BTT.")
    else:
        print("Listing widgets requires bttcli.")


def main():
    parser = argparse.ArgumentParser(description="BetterTouchTool Touch Bar control")
    subparsers = parser.add_subparsers(dest="command")

    add_parser = subparsers.add_parser("add-widget", help="Add a Touch Bar widget")
    add_parser.add_argument("--type", default="button", help="Widget type")
    add_parser.add_argument("--title", required=True, help="Widget title")
    add_parser.add_argument("--script", help="Shell script for widget content")

    subparsers.add_parser("list", help="List Touch Bar widgets")

    import_parser = subparsers.add_parser("import", help="Import a preset")
    import_parser.add_argument("path", help="Preset file path")

    export_parser = subparsers.add_parser("export", help="Export current config")
    export_parser.add_argument("path", help="Output file path")

    args = parser.parse_args()

    if args.command == "add-widget":
        add_widget(args)
    elif args.command == "list":
        list_widgets()
    elif args.command == "import":
        import_preset(args.path)
    elif args.command == "export":
        export_preset(args.path)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
