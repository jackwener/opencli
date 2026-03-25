# google

Auto-generated from `src/clis/google` source files.

Total commands: **4**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### news
- Description: Get Google News headlines
- Risk: low
- Source: `src/clis/google/news.ts`
- Args:
  - `keyword` (optional) — Search query (omit for top stories)
  - `limit` (optional) — type=int; default=10; Number of results
  - `lang` (optional) — default='en'; Language short code (e.g. en, zh)
  - `region` (optional) — default='US'; Region code (e.g. US, CN)
- Example: `opencli google news -f json`

### search
- Description: Search Google
- Risk: low
- Source: `src/clis/google/search.ts`
- Args:
  - `keyword` (required) — Search query
  - `limit` (optional) — type=int; default=10; Number of results (1-100)
  - `lang` (optional) — default='en'; Language short code (e.g. en, zh)
- Example: `opencli google search -f json`

### suggest
- Description: Get Google search suggestions
- Risk: low
- Source: `src/clis/google/suggest.ts`
- Args:
  - `keyword` (required) — Search query
  - `lang` (optional) — default='zh-CN'; Language code
- Example: `opencli google suggest -f json`

### trends
- Description: Get Google Trends daily trending searches
- Risk: low
- Source: `src/clis/google/trends.ts`
- Args:
  - `region` (optional) — default='US'; Region code (e.g. US, CN, JP)
  - `limit` (optional) — type=int; default=20; Number of results
- Example: `opencli google trends -f json`
