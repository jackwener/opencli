#!/usr/bin/env python3
"""
Camoufox server launcher for opencli.

Starts a Camoufox browser in server mode and outputs the WebSocket endpoint
as JSON for the Node.js caller to parse.

Usage:
    python3 scripts/camoufox_server.py [--headless] [--port PORT]
"""

import sys
import json


def main():
    headless = "--headless" in sys.argv
    port = None
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])

    try:
        from camoufox.server import launch_server
    except ImportError:
        print(json.dumps({"error": "camoufox not installed. Run: pip3 install camoufox"}), flush=True)
        sys.exit(1)

    try:
        kwargs = {"headless": headless}
        if port is not None:
            kwargs["port"] = port

        ws_endpoint = launch_server(**kwargs)
        print(json.dumps({"ws_endpoint": ws_endpoint}), flush=True)

        # Keep the process running — the server lives as long as this process
        # Use threading.Event instead of signal.pause for cross-platform compat
        import threading
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
