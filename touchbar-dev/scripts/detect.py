"""Detect Touch Bar backends and hardware."""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from helpers import get_mtmr_config_path


def run_cmd(cmd, timeout=5):
    """Run a shell command, return stdout or None on failure."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def check_mtmr_installed():
    """Check if MTMR is installed. Returns dict with status info."""
    info = {"installed": False, "config_exists": False, "config_path": None}

    # Check via mdfind (Spotlight)
    result = run_cmd('mdfind "kMDItemCFBundleIdentifier == com.toxblh.mtmr"')
    if result:
        info["installed"] = True
        info["app_path"] = result.split("\n")[0]

    # Also check common install locations
    if not info["installed"]:
        app_path = Path("/Applications/MTMR.app")
        if app_path.exists():
            info["installed"] = True
            info["app_path"] = str(app_path)

    # Check config directory
    config_path = get_mtmr_config_path()
    info["config_path"] = str(config_path)
    if config_path.exists():
        info["config_exists"] = True

    return info


def check_btt_installed():
    """Check if BetterTouchTool is installed. Returns dict with status info."""
    info = {
        "installed": False,
        "cli_available": False,
        "api_available": False,
    }

    # Check via mdfind
    result = run_cmd('mdfind "kMDItemCFBundleIdentifier == com.hegenberg.BetterTouchTool"')
    if result:
        info["installed"] = True
        info["app_path"] = result.split("\n")[0]

    if not info["installed"]:
        app_path = Path("/Applications/BetterTouchTool.app")
        if app_path.exists():
            info["installed"] = True
            info["app_path"] = str(app_path)

    # Check bttcli
    cli_path = Path("/usr/local/bin/bttcli")
    if cli_path.exists():
        info["cli_available"] = True
        info["cli_path"] = str(cli_path)

    # Check HTTP API (quick connect test)
    result = run_cmd("curl -s -o /dev/null -w '%{http_code}' --connect-timeout 1 http://127.0.0.1:64472/", timeout=3)
    if result and result != "000":
        info["api_available"] = True

    return info


def check_touchbar_hardware():
    """Check if this Mac has Touch Bar hardware."""
    info = {"has_touchbar": False}

    # Check for TouchBar process/device in ioreg
    tb_check = run_cmd("ioreg -l 2>/dev/null | grep -c TouchBarUserDevice")
    if tb_check and int(tb_check) > 0:
        info["has_touchbar"] = True

    # Get model identifier for display purposes (don't override touchbar detection)
    result = run_cmd("system_profiler SPiBridgeDataType 2>/dev/null")
    if result:
        for line in result.split("\n"):
            if "Model Identifier" in line or "Model Name" in line:
                info["model"] = line.split(":")[-1].strip()
                break

    return info


def check_touchbar_simulator():
    """Check if Touch Bar Simulator (Xcode) is available."""
    info = {"available": False}

    result = run_cmd('mdfind "kMDItemCFBundleIdentifier == com.apple.touchbar.simulator"')
    if result:
        info["available"] = True
        info["path"] = result.split("\n")[0]

    return info


def detect_all():
    """Run all detection checks. Returns combined dict."""
    return {
        "mtmr": check_mtmr_installed(),
        "btt": check_btt_installed(),
        "hardware": check_touchbar_hardware(),
        "simulator": check_touchbar_simulator(),
    }


def print_table(results):
    """Print detection results as a Rich table."""
    try:
        from rich.console import Console
        from rich.table import Table

        console = Console()
        table = Table(title="Touch Bar Environment")

        table.add_column("Component", style="cyan")
        table.add_column("Status", style="bold")
        table.add_column("Details")

        # MTMR
        mtmr = results["mtmr"]
        status = "[green]Installed[/green]" if mtmr["installed"] else "[red]Not found[/red]"
        details = ""
        if mtmr["installed"]:
            details = f"Config: {'exists' if mtmr['config_exists'] else 'missing'}"
        table.add_row("MTMR", status, details)

        # BTT
        btt = results["btt"]
        status = "[green]Installed[/green]" if btt["installed"] else "[red]Not found[/red]"
        details_parts = []
        if btt["cli_available"]:
            details_parts.append("CLI ready")
        if btt["api_available"]:
            details_parts.append("API ready")
        table.add_row("BetterTouchTool", status, ", ".join(details_parts))

        # Hardware
        hw = results["hardware"]
        status = "[green]Present[/green]" if hw["has_touchbar"] else "[yellow]Not detected[/yellow]"
        details = hw.get("model", "")
        table.add_row("Touch Bar Hardware", status, details)

        # Simulator
        sim = results["simulator"]
        status = "[green]Available[/green]" if sim["available"] else "[dim]Not found[/dim]"
        table.add_row("Touch Bar Simulator", status, "")

        console.print(table)

        # Print actionable next steps
        hints = []
        if not results["mtmr"]["installed"] and not results["btt"]["installed"]:
            hints.append("No backend installed. Run: brew install --cask mtmr  (free, recommended)")
        elif results["btt"]["installed"] and not results["btt"]["cli_available"] and not results["btt"]["api_available"]:
            hints.append("BTT installed but API not available. Open BTT, then enable:")
            hints.append("  Preferences > Advanced > Allow External Connections via btt:// URL Scheme")
        if results["mtmr"]["installed"] and not results["mtmr"]["config_exists"]:
            hints.append("MTMR installed but no config found. Run: run.sh apply --template minimal")
        if not results["hardware"]["has_touchbar"] and not results["simulator"]["available"]:
            hints.append("No Touch Bar or simulator. Configs can still be generated for later use.")

        if hints:
            console.print()
            console.print("[bold yellow]Next steps:[/bold yellow]")
            for hint in hints:
                console.print(f"  {hint}")

    except ImportError:
        # Fallback without Rich
        print("Touch Bar Environment:")
        print(f"  MTMR:           {'Installed' if results['mtmr']['installed'] else 'Not found'}")
        print(f"  BetterTouchTool: {'Installed' if results['btt']['installed'] else 'Not found'}")
        print(f"  Touch Bar HW:   {'Present' if results['hardware']['has_touchbar'] else 'Not detected'}")
        print(f"  Simulator:      {'Available' if results['simulator']['available'] else 'Not found'}")


def main():
    parser = argparse.ArgumentParser(description="Detect Touch Bar environment")
    parser.add_argument("--check", action="store_true",
                        help="Silent gate check — exit 1 if no backend found")
    parser.add_argument("--json", action="store_true",
                        help="Output machine-readable JSON")
    args = parser.parse_args()

    results = detect_all()

    if args.check:
        has_backend = results["mtmr"]["installed"] or results["btt"]["installed"]
        if not has_backend:
            print("Error: No Touch Bar backend found. Install MTMR or BetterTouchTool first.")
            print("  brew install --cask mtmr")
            print("  brew install --cask bettertouchtool")
            sys.exit(1)
        sys.exit(0)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print_table(results)


if __name__ == "__main__":
    main()
