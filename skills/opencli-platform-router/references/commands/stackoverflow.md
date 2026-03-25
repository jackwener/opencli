# stackoverflow

Auto-generated from `src/clis/stackoverflow` source files.

Total commands: **4**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### bounties
- Description: Active bounties on Stack Overflow
- Risk: low
- Source: `src/clis/stackoverflow/bounties.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Max number of results
- Example: `opencli stackoverflow bounties -f json`

### hot
- Description: Hot Stack Overflow questions
- Risk: low
- Source: `src/clis/stackoverflow/hot.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Max number of results
- Example: `opencli stackoverflow hot -f json`

### search
- Description: Search Stack Overflow questions
- Risk: low
- Source: `src/clis/stackoverflow/search.yaml`
- Args:
  - `query` (required) — type=string; Search query
  - `limit` (optional) — type=int; default=10; Max number of results
- Example: `opencli stackoverflow search -f json`

### unanswered
- Description: Top voted unanswered questions on Stack Overflow
- Risk: low
- Source: `src/clis/stackoverflow/unanswered.yaml`
- Args:
  - `limit` (optional) — type=int; default=10; Max number of results
- Example: `opencli stackoverflow unanswered -f json`
