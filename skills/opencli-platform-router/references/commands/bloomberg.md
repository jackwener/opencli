# bloomberg

Auto-generated from `src/clis/bloomberg` source files.

Total commands: **10**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### businessweek
- Description: Bloomberg Businessweek top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/businessweek.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg businessweek -f json`

### economics
- Description: Bloomberg Economics top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/economics.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg economics -f json`

### feeds
- Description: List the Bloomberg RSS feed aliases used by the adapter
- Risk: low
- Source: `src/clis/bloomberg/feeds.ts`
- Args: none declared
- Example: `opencli bloomberg feeds -f json`

### industries
- Description: Bloomberg Industries top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/industries.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg industries -f json`

### main
- Description: Bloomberg homepage top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/main.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg main -f json`

### markets
- Description: Bloomberg Markets top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/markets.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg markets -f json`

### news
- Description: Read a Bloomberg story/article page and return title, full content, and media links
- Risk: low
- Source: `src/clis/bloomberg/news.ts`
- Args:
  - `link` (required) — Bloomberg story/article URL or relative Bloomberg path
- Example: `opencli bloomberg news -f json`

### opinions
- Description: Bloomberg Opinion top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/opinions.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg opinions -f json`

### politics
- Description: Bloomberg Politics top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/politics.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg politics -f json`

### tech
- Description: Bloomberg Tech top stories (RSS)
- Risk: low
- Source: `src/clis/bloomberg/tech.ts`
- Args:
  - `limit` (optional) — type=int; default=1; Number of feed items to return (max 20)
- Example: `opencli bloomberg tech -f json`
