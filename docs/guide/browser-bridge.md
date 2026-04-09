# Browser Bridge Setup

> **⚠️ Important**: Browser commands reuse your Chrome login session. You must be logged into the target website in Chrome before running commands.

OpenCLI connects to your browser through a lightweight **Browser Bridge** Chrome Extension + micro-daemon (zero config, auto-start).

## Extension Installation

### Method 1: Download Pre-built Release (Recommended)

1. Go to the GitHub [Releases page](https://github.com/jackwener/opencli/releases) and download the latest `opencli-extension.zip`.
2. Unzip the file and open `chrome://extensions`, enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the unzipped folder.

### Method 2: Load Unpacked Source (For Developers)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` directory from the repository.

## Verification

That's it! The daemon auto-starts when you run any browser command. No tokens, no manual configuration.

```bash
opencli doctor            # Check extension + daemon connectivity
```

## How It Works

```
┌─────────────┐     WebSocket      ┌──────────────┐     Chrome API     ┌─────────┐
│  opencli    │ ◄──────────────► │  micro-daemon │ ◄──────────────► │  Chrome  │
│  (Node.js)  │    localhost:19825  │  (auto-start) │    Extension       │ Browser  │
└─────────────┘                    └──────────────┘                    └─────────┘
```

The daemon manages the WebSocket connection between your CLI commands and the Chrome extension. The extension executes JavaScript in the context of web pages, with access to the logged-in session.

## Daemon Lifecycle

The daemon auto-starts on first browser command and stays alive for **4 hours** by default. It exits only when both conditions are met: no CLI requests for the timeout period AND no Chrome extension connected.

```bash
opencli daemon status    # Check daemon state (PID, uptime, extension, memory)
opencli daemon stop      # Graceful shutdown
opencli daemon restart   # Stop + restart
```

Override the timeout via the `OPENCLI_DAEMON_TIMEOUT` environment variable (milliseconds). Set to `0` to keep the daemon alive indefinitely.

To customize the daemon bind address and port persistently, create `~/.opencli/daemon.yaml`:

```yaml
host: 127.0.0.1
port: 19825
```

- `host`: the address the daemon listens on
- `port`: the daemon HTTP/WebSocket port

If `host` is set to `0.0.0.0`, the CLI automatically connects via `127.0.0.1`.

Environment variables still work and take precedence:

```bash
OPENCLI_DAEMON_HOST=0.0.0.0
OPENCLI_DAEMON_PORT=29876
```

The browser extension popup also lets you set the daemon host and port it should connect to.
