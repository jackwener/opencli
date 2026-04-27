# Browser Bridge Setup

> **⚠️ Important**: Browser commands reuse your Chrome login session. You must be logged into the target website in Chrome before running commands.

OpenCLI connects to your browser through a lightweight **Browser Bridge** Chrome Extension + micro-daemon (zero config, auto-start).

## Extension Installation

### Method 1: Download Pre-built Release (Recommended)

1. Go to the GitHub [Releases page](https://github.com/jackwener/opencli/releases) and download the latest `opencli-extension-v{version}.zip`.
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

## Tab Targeting

Browser commands run inside the shared `browser:default` workspace unless you explicitly choose another tab target.

```bash
opencli browser open https://www.baidu.com/
opencli browser tab list
opencli browser tab new https://www.baidu.com/
opencli browser eval --tab <targetId> 'document.title'
opencli browser tab select <targetId>
opencli browser get title
opencli browser tab close <targetId>
```

Key rules:

- `opencli browser open <url>` and `opencli browser tab new [url]` return a `targetId`.
- `opencli browser tab list` prints the `targetId` values of tabs that already exist.
- `--tab <targetId>` routes a single browser command to that specific tab.
- `tab new` creates a new tab but does not change the default browser target.
- `tab select <targetId>` makes that tab the default target for later untargeted `opencli browser ...` commands.
- `tab close <targetId>` removes the tab; if it was the current default target, the stored default is cleared.

## Multiple Chrome Profiles

If you install the Browser Bridge extension in more than one Chrome profile (e.g. `Work` and `Personal`), all of them stay connected to the same daemon simultaneously. Commands route by profile so each CLI invocation lands in the Chrome profile you intended instead of silently hitting whichever extension connected last.

### Label a profile

Each extension generates a unique `profileId` the first time it runs. The popup shows a default label (`Profile-<short-hash>`); click the pencil icon on the chip to rename it to something short like `work` or `home`. That label is what you use in the CLI.

### Select which profile a command runs in

Resolution order (highest priority first):

1. `--profile <name>` flag on the individual command
2. `OPENCLI_PROFILE` environment variable (per-shell)
3. `opencli profile use <name>` persistent default (`~/.opencli/config.json`)
4. Automatic routing when exactly one profile is connected (backwards-compatible)

```bash
opencli profile list                     # See connected profiles
opencli profile use work                 # Persist a default
opencli profile current                  # Show the resolved default
opencli --profile personal reddit saved  # Override for one command
```

### Concurrent sessions on different profiles

Use `OPENCLI_PROFILE` (per-shell env) when running two terminals / Claude Code sessions / Codex sessions at the same time. Each session targets its own profile without fighting over a shared default.

```bash
# Terminal 1
export OPENCLI_PROFILE=work
opencli reddit saved

# Terminal 2 — independent, concurrent
export OPENCLI_PROFILE=personal
opencli reddit saved
```

Both commands reach their own Chrome profile's automation window; cookies, session state, and logins stay fully isolated.

## How It Works

```
┌─────────────┐     WebSocket      ┌──────────────┐     Chrome API     ┌─────────┐
│  opencli    │ ◄──────────────► │  micro-daemon │ ◄──────────────► │  Chrome  │
│  (Node.js)  │    localhost:19825  │  (auto-start) │    Extension       │ Browser  │
└─────────────┘                    └──────────────┘                    └─────────┘
```

The daemon manages the WebSocket connection between your CLI commands and the Chrome extension. The extension executes JavaScript in the context of web pages, with access to the logged-in session.

## Daemon Lifecycle

The daemon auto-starts on first browser command and stays alive persistently.

```bash
opencli daemon stop      # Graceful shutdown
```

The daemon is persistent — it stays alive until you explicitly stop it (`opencli daemon stop`) or uninstall the package.
