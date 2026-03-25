# reuters

Auto-generated from `src/clis/reuters` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### search
- Description: Reuters 路透社新闻搜索
- Risk: low
- Source: `src/clis/reuters/search.ts`
- Args:
  - `query` (required) — Search query
  - `limit` (optional) — type=int; default=10; Number of results (max 40)
- Example: `opencli reuters search -f json`
