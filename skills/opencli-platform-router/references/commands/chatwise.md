# chatwise

Auto-generated from `src/clis/chatwise` source files.

Total commands: **9**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a prompt and wait for the AI response (send + wait + read)
- Risk: low
- Source: `src/clis/chatwise/ask.ts`
- Args:
  - `text` (required) — Prompt to send
  - `timeout` (optional) — default=30)'; Max seconds to wait (default: 30)
- Example: `opencli chatwise ask -f json`

### export
- Description: Export the current ChatWise conversation to a Markdown file
- Risk: low
- Source: `src/clis/chatwise/export.ts`
- Args:
  - `output` (optional) — default=/tmp/chatwise-export.md)'; Output file (default: /tmp/chatwise-export.md)
- Example: `opencli chatwise export -f json`

### history
- Description: List conversation history in ChatWise sidebar
- Risk: low
- Source: `src/clis/chatwise/history.ts`
- Args: none declared
- Example: `opencli chatwise history -f json`

### model
- Description: Get or switch the active AI model in ChatWise
- Risk: low
- Source: `src/clis/chatwise/model.ts`
- Args:
  - `model-name` (optional) — Model to switch to (e.g. gpt-4, claude-3)
- Example: `opencli chatwise model -f json`

### new
- Description: Start a new conversation in ChatWise
- Risk: low
- Source: `src/clis/chatwise/new.ts`
- Args: none declared
- Example: `opencli chatwise new -f json`

### read
- Description: Read the current ChatWise conversation history
- Risk: low
- Source: `src/clis/chatwise/read.ts`
- Args: none declared
- Example: `opencli chatwise read -f json`

### screenshot
- Description: Capture a snapshot of the current ChatWise window (DOM + Accessibility tree)
- Risk: low
- Source: `src/clis/chatwise/screenshot.ts`
- Args:
  - `output` (optional) — default=/tmp/chatwise-snapshot)'; Output file path (default: /tmp/chatwise-snapshot)
- Example: `opencli chatwise screenshot -f json`

### send
- Description: Send a message to the active ChatWise conversation
- Risk: low
- Source: `src/clis/chatwise/send.ts`
- Args:
  - `text` (required) — Message to send
- Example: `opencli chatwise send -f json`

### status
- Description: Check active CDP connection to ChatWise Desktop
- Risk: low
- Source: `src/clis/chatwise/status.ts`
- Args: none declared
- Example: `opencli chatwise status -f json`
