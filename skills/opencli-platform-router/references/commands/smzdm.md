# smzdm

Auto-generated from `src/clis/smzdm` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### search
- Description: 什么值得买搜索好价
- Risk: low
- Source: `src/clis/smzdm/search.ts`
- Args:
  - `query` (required) — Search keyword
  - `limit` (optional) — type=int; default=20; Number of results
- Example: `opencli smzdm search -f json`
