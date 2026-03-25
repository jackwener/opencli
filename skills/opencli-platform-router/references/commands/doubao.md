# doubao

Auto-generated from `src/clis/doubao` source files.

Total commands: **5**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a prompt and wait for the Doubao response
- Risk: low
- Source: `src/clis/doubao/ask.ts`
- Args:
  - `text` (required) — Prompt to send
  - `timeout` (optional) — default=60)'; Max seconds to wait (default: 60)
- Example: `opencli doubao ask -f json`

### new
- Description: Start a new conversation in Doubao web chat
- Risk: low
- Source: `src/clis/doubao/new.ts`
- Args: none declared
- Example: `opencli doubao new -f json`

### read
- Description: Read the current Doubao conversation history
- Risk: low
- Source: `src/clis/doubao/read.ts`
- Args: none declared
- Example: `opencli doubao read -f json`

### send
- Description: Send a message to Doubao web chat
- Risk: low
- Source: `src/clis/doubao/send.ts`
- Args:
  - `text` (required) — Message to send
- Example: `opencli doubao send -f json`

### status
- Description: Check Doubao chat page availability and login state
- Risk: low
- Source: `src/clis/doubao/status.ts`
- Args: none declared
- Example: `opencli doubao status -f json`
