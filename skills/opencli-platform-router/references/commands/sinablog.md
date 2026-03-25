# sinablog

Auto-generated from `src/clis/sinablog` source files.

Total commands: **4**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### article
- Description: 获取新浪博客单篇文章详情
- Risk: low
- Source: `src/clis/sinablog/article.ts`
- Args:
  - `url` (required) — 文章URL（如 https://blog.sina.com.cn/s/blog_xxx.html）
- Example: `opencli sinablog article -f json`

### hot
- Description: 获取新浪博客热门文章/推荐
- Risk: low
- Source: `src/clis/sinablog/hot.ts`
- Args:
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli sinablog hot -f json`

### search
- Description: 搜索新浪博客文章（通过新浪搜索）
- Risk: low
- Source: `src/clis/sinablog/search.ts`
- Args:
  - `keyword` (required) — 搜索关键词
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli sinablog search -f json`

### user
- Description: 获取新浪博客用户的文章列表
- Risk: low
- Source: `src/clis/sinablog/user.ts`
- Args:
  - `uid` (required) — 新浪博客用户ID（如 1234567890）
  - `limit` (optional) — type=int; default=20; 返回的文章数量
- Example: `opencli sinablog user -f json`
