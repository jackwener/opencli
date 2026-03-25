# chatgpt

Auto-generated from `src/clis/chatgpt` source files.

Total commands: **5**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a prompt and wait for the AI response (send + wait + read)
- Risk: low
- Source: `src/clis/chatgpt/ask.ts`
- Args:
  - `text` (required) — Prompt to send
  - `timeout` (optional) — default=30)'; Max seconds to wait for response (default: 30)
- Example: `opencli chatgpt ask -f json`

### new
- Description: Open a new chat in ChatGPT Desktop App
- Risk: low
- Source: `src/clis/chatgpt/new.ts`
- Args: none declared
- Example: `opencli chatgpt new -f json`

### read
- Description: Read the last visible message from the focused ChatGPT Desktop window
- Risk: low
- Source: `src/clis/chatgpt/read.ts`
- Args: none declared
- Example: `opencli chatgpt read -f json`

### send
- Description: Send a message to the active ChatGPT Desktop App window
- Risk: low
- Source: `src/clis/chatgpt/send.ts`
- Args:
  - `text` (required) — Message to send
- Example: `opencli chatgpt send -f json`

### status
- Description: Check if ChatGPT Desktop App is running natively on macOS
- Risk: low
- Source: `src/clis/chatgpt/status.ts`
- Args: none declared
- Example: `opencli chatgpt status -f json`
