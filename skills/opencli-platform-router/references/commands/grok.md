# grok

Auto-generated from `src/clis/grok` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### ask
- Description: Send a message to Grok and get response
- Risk: low
- Source: `src/clis/grok/ask.ts`
- Args:
  - `prompt` (required) — type=string; Prompt to send to Grok
  - `timeout` (optional) — type=int; default=120; Max seconds to wait for response (default: 120)
  - `new` (optional) — type=boolean; default=false; Start a new chat before sending (default: false)
  - `web` (optional) — type=boolean; default=false; Use the explicit grok.com consumer web flow (default: false)
- Example: `opencli grok ask -f json`
