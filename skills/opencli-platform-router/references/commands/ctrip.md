# ctrip

Auto-generated from `src/clis/ctrip` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### search
- Description: 携程旅行搜索
- Risk: low
- Source: `src/clis/ctrip/search.ts`
- Args:
  - `query` (required) — Search keyword (city or attraction)
  - `limit` (optional) — type=int; default=15; Number of results
- Example: `opencli ctrip search -f json`
