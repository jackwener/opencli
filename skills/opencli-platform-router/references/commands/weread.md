# weread

Auto-generated from `src/clis/weread` source files.

Total commands: **7**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### book
- Description: View book details on WeRead
- Risk: low
- Source: `src/clis/weread/book.ts`
- Args:
  - `book-id` (required) — Book ID (numeric, from search or shelf results)
- Example: `opencli weread book -f json`

### highlights
- Description: List your highlights (underlines) in a book
- Risk: low
- Source: `src/clis/weread/highlights.ts`
- Args:
  - `book-id` (required) — Book ID (from shelf or search results)
  - `limit` (optional) — type=int; default=20; Max results
- Example: `opencli weread highlights -f json`

### notebooks
- Description: List books that have highlights or notes
- Risk: low
- Source: `src/clis/weread/notebooks.ts`
- Args: none declared
- Example: `opencli weread notebooks -f json`

### notes
- Description: List your notes (thoughts) on a book
- Risk: low
- Source: `src/clis/weread/notes.ts`
- Args:
  - `book-id` (required) — Book ID (from shelf or search results)
  - `limit` (optional) — type=int; default=20; Max results
- Example: `opencli weread notes -f json`

### ranking
- Description: WeRead book rankings by category
- Risk: low
- Source: `src/clis/weread/ranking.ts`
- Args:
  - `category` (optional) — default='all'; Category: all (default), rising, or numeric category ID
  - `limit` (optional) — type=int; default=20; Max results
- Example: `opencli weread ranking -f json`

### search
- Description: Search books on WeRead
- Risk: low
- Source: `src/clis/weread/search.ts`
- Args:
  - `query` (required) — Search keyword
  - `limit` (optional) — type=int; default=10; Max results
- Example: `opencli weread search -f json`

### shelf
- Description: List books on your WeRead bookshelf
- Risk: low
- Source: `src/clis/weread/shelf.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Max results
- Example: `opencli weread shelf -f json`
