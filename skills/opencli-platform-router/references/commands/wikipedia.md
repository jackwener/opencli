# wikipedia

Auto-generated from `src/clis/wikipedia` source files.

Total commands: **4**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### random
- Description: Get a random Wikipedia article
- Risk: low
- Source: `src/clis/wikipedia/random.ts`
- Args:
  - `lang` (optional) — default='en'; Language code (e.g. en, zh, ja)
- Example: `opencli wikipedia random -f json`

### search
- Description: Search Wikipedia articles
- Risk: low
- Source: `src/clis/wikipedia/search.ts`
- Args:
  - `query` (required) — Search keyword
  - `limit` (optional) — type=int; default=10; Max results
  - `lang` (optional) — default='en'; Language code (e.g. en, zh, ja)
- Example: `opencli wikipedia search -f json`

### summary
- Description: Get Wikipedia article summary
- Risk: low
- Source: `src/clis/wikipedia/summary.ts`
- Args:
  - `title` (required) — Article title (e.g.
  - `lang` (optional) — default='en'; Language code (e.g. en, zh, ja)
- Example: `opencli wikipedia summary -f json`

### trending
- Description: Most-read Wikipedia articles (yesterday)
- Risk: low
- Source: `src/clis/wikipedia/trending.ts`
- Args:
  - `limit` (optional) — type=int; default=10; Max results
  - `lang` (optional) — default='en'; Language code (e.g. en, zh, ja)
- Example: `opencli wikipedia trending -f json`
