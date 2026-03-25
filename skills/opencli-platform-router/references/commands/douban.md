# douban

Auto-generated from `src/clis/douban` source files.

Total commands: **7**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### book-hot
- Description: 豆瓣图书热门榜单
- Risk: low
- Source: `src/clis/douban/book-hot.ts`
- Args:
  - `limit` (optional) — type=int; default=20; 返回的图书数量
- Example: `opencli douban book-hot -f json`

### marks
- Description: 导出个人观影标记
- Risk: low
- Source: `src/clis/douban/marks.ts`
- Args:
  - `status` (optional) — default='collect'; 标记类型: collect(看过), wish(想看), do(在看), all(全部)
  - `limit` (optional) — type=int; default=50; 导出数量， 0 表示全部
  - `uid` (optional) — 用户ID，不填则使用当前登录账号
- Example: `opencli douban marks -f json`

### movie-hot
- Description: 豆瓣电影热门榜单
- Risk: low
- Source: `src/clis/douban/movie-hot.ts`
- Args:
  - `limit` (optional) — type=int; default=20; 返回的电影数量
- Example: `opencli douban movie-hot -f json`

### reviews
- Description: 导出个人影评
- Risk: low
- Source: `src/clis/douban/reviews.ts`
- Args:
  - `limit` (optional) — type=int; default=20; 导出数量
  - `uid` (optional) — 用户ID，不填则使用当前登录账号
  - `full` (optional) — type=bool; default=false; 获取完整影评内容
- Example: `opencli douban reviews -f json`

### search
- Description: 搜索豆瓣电影、图书或音乐
- Risk: low
- Source: `src/clis/douban/search.ts`
- Args:
  - `type` (optional) — default='movie'; 搜索类型（movie=电影, book=图书, music=音乐）
  - `keyword` (required) — 搜索关键词
  - `limit` (optional) — type=int; default=20; 返回结果数量
- Example: `opencli douban search -f json`

### subject
- Description: 获取电影详情
- Risk: low
- Source: `src/clis/douban/subject.yaml`
- Args:
  - `id` (required) — type=str; 电影 ID
- Example: `opencli douban subject -f json`

### top250
- Description: 豆瓣电影 Top250
- Risk: low
- Source: `src/clis/douban/top250.yaml`
- Args:
  - `limit` (optional) — type=int; default=250; 返回结果数量
- Example: `opencli douban top250 -f json`
