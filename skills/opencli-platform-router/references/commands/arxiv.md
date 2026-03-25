# arxiv

Auto-generated from `src/clis/arxiv` source files.

Total commands: **2**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### paper
- Description: Get arXiv paper details by ID
- Risk: low
- Source: `src/clis/arxiv/paper.ts`
- Args:
  - `id` (required) — arXiv paper ID (e.g. 1706.03762)
- Example: `opencli arxiv paper -f json`

### search
- Description: Search arXiv papers
- Risk: low
- Source: `src/clis/arxiv/search.ts`
- Args:
  - `query` (required) — Search keyword (e.g.
  - `limit` (optional) — type=int; default=10; Max results (max 25)
- Example: `opencli arxiv search -f json`
