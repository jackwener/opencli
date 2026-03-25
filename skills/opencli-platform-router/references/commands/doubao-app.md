# doubao-app

Auto-generated from `src/clis/doubao-app` source files.

Total commands: **7**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a message to Doubao desktop app and wait for the AI response
- Risk: low
- Source: `src/clis/doubao-app/ask.ts`
- Args:
  - `text` (required) — Prompt to send
  - `timeout` (optional) — type=int; default=30; Max seconds to wait for response
- Example: `opencli doubao-app ask -f json`

### dump
- Description: Dump Doubao desktop app DOM and snapshot to /tmp for debugging
- Risk: low
- Source: `src/clis/doubao-app/dump.ts`
- Args: none declared
- Example: `opencli doubao-app dump -f json`

### new
- Description: Start a new chat in Doubao desktop app
- Risk: low
- Source: `src/clis/doubao-app/new.ts`
- Args: none declared
- Example: `opencli doubao-app new -f json`

### read
- Description: Read chat history from Doubao desktop app
- Risk: low
- Source: `src/clis/doubao-app/read.ts`
- Args: none declared
- Example: `opencli doubao-app read -f json`

### screenshot
- Description: Capture a screenshot of the Doubao desktop app window
- Risk: low
- Source: `src/clis/doubao-app/screenshot.ts`
- Args:
  - `output` (optional) — default=/tmp/doubao-screenshot.png)'; Output file path (default: /tmp/doubao-screenshot.png)
- Example: `opencli doubao-app screenshot -f json`

### send
- Description: Send a message to Doubao desktop app
- Risk: low
- Source: `src/clis/doubao-app/send.ts`
- Args:
  - `text` (required) — Message text to send
- Example: `opencli doubao-app send -f json`

### status
- Description: Check CDP connection to Doubao desktop app
- Risk: low
- Source: `src/clis/doubao-app/status.ts`
- Args: none declared
- Example: `opencli doubao-app status -f json`
