# apple-podcasts

Auto-generated from `src/clis/apple-podcasts` source files.

Total commands: **3**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### episodes
- Description: List recent episodes of an Apple Podcast (use ID from search)
- Risk: low
- Source: `src/clis/apple-podcasts/episodes.ts`
- Args:
  - `id` (required) — Podcast ID (collectionId from search output)
  - `limit` (optional) — type=int; default=15; Max episodes to show
- Example: `opencli apple-podcasts episodes -f json`

### search
- Description: Search Apple Podcasts
- Risk: low
- Source: `src/clis/apple-podcasts/search.ts`
- Args:
  - `query` (required) — Search keyword
  - `limit` (optional) — type=int; default=10; Max results
- Example: `opencli apple-podcasts search -f json`

### top
- Description: Top podcasts chart on Apple Podcasts
- Risk: low
- Source: `src/clis/apple-podcasts/top.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of podcasts (max 100)
  - `country` (optional) — default='us'; Country code (e.g. us, cn, gb, jp)
- Example: `opencli apple-podcasts top -f json`
