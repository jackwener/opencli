# bbc

Auto-generated from `src/clis/bbc` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### news
- Description: BBC News headlines (RSS)
- Risk: low
- Source: `src/clis/bbc/news.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of headlines (max 50)
- Example: `opencli bbc news -f json`
