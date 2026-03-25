# xiaoyuzhou

Auto-generated from `src/clis/xiaoyuzhou` source files.

Total commands: **3**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### episode
- Description: View details of a Xiaoyuzhou podcast episode
- Risk: low
- Source: `src/clis/xiaoyuzhou/episode.ts`
- Args:
  - `id` (required) — Episode ID (eid from podcast-episodes output)
- Example: `opencli xiaoyuzhou episode -f json`

### podcast
- Description: View a Xiaoyuzhou podcast profile
- Risk: low
- Source: `src/clis/xiaoyuzhou/podcast.ts`
- Args:
  - `id` (required) — Podcast ID (from xiaoyuzhoufm.com URL)
- Example: `opencli xiaoyuzhou podcast -f json`

### podcast-episodes
- Description: List recent episodes of a Xiaoyuzhou podcast (up to 15, SSR limit)
- Risk: low
- Source: `src/clis/xiaoyuzhou/podcast-episodes.ts`
- Args:
  - `id` (required) — Podcast ID (from xiaoyuzhoufm.com URL)
  - `limit` (optional) — type=int; default=15; Max episodes to show (up to 15, SSR limit)
- Example: `opencli xiaoyuzhou podcast-episodes -f json`
