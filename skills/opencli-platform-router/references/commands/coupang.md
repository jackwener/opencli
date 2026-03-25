# coupang

Auto-generated from `src/clis/coupang` source files.

Total commands: **2**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### add-to-cart
- Description: Add a Coupang product to cart using logged-in browser session
- Risk: low
- Source: `src/clis/coupang/add-to-cart.ts`
- Args:
  - `product-id` (optional) — Coupang product ID
  - `url` (optional) — Canonical product URL
- Example: `opencli coupang add-to-cart -f json`

### search
- Description: Search Coupang products with logged-in browser session
- Risk: low
- Source: `src/clis/coupang/search.ts`
- Args:
  - `query` (required) — Search keyword
  - `page` (optional) — type=int; default=1; Search result page number
  - `limit` (optional) — type=int; default=20; Max results (max 50)
  - `filter` (optional) — Optional search filter (currently supports: rocket)
- Example: `opencli coupang search -f json`
