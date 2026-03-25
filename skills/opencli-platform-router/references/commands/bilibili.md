# bilibili

Auto-generated from `src/clis/bilibili` source files.

Total commands: **12**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### download
- Description: 下载B站视频（需要 yt-dlp）
- Risk: low
- Source: `src/clis/bilibili/download.ts`
- Args:
  - `bvid` (required) — Video BV ID (e.g., BV1xxx)
  - `output` (optional) — default='./bilibili-downloads'; Output directory
  - `quality` (optional) — default='best'; Video quality (best, 1080p, 720p, 480p)
- Example: `opencli bilibili download -f json`

### dynamic
- Description: Get Bilibili user dynamic feed
- Risk: low
- Source: `src/clis/bilibili/dynamic.ts`
- Args:
  - `limit` (optional) — type=int; default=15
- Example: `opencli bilibili dynamic -f json`

### favorite
- Description: 我的默认收藏夹
- Risk: low
- Source: `src/clis/bilibili/favorite.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of results
  - `page` (optional) — type=int; default=1; Page number
- Example: `opencli bilibili favorite -f json`

### feed
- Description: 关注的人的动态时间线
- Risk: low
- Source: `src/clis/bilibili/feed.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of results
  - `type` (optional) — default='all'; Filter: all, video, article
- Example: `opencli bilibili feed -f json`

### following
- Description: 获取 Bilibili 用户的关注列表
- Risk: high
- Source: `src/clis/bilibili/following.ts`
- Args:
  - `uid` (optional) — 目标用户 ID（默认为当前登录用户）
  - `page` (optional) — type=int; default=1; 页码
  - `limit` (optional) — type=int; default=50; 每页数量 (最大 50)
- Example: `opencli bilibili following -f json`

### history
- Description: 我的观看历史
- Risk: low
- Source: `src/clis/bilibili/history.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of results
- Example: `opencli bilibili history -f json`

### hot
- Description: B站热门视频
- Risk: low
- Source: `src/clis/bilibili/hot.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; Number of videos
- Example: `opencli bilibili hot -f json`

### me
- Description: My Bilibili profile info
- Risk: low
- Source: `src/clis/bilibili/me.ts`
- Args: none declared
- Example: `opencli bilibili me -f json`

### ranking
- Description: Get Bilibili video ranking board
- Risk: low
- Source: `src/clis/bilibili/ranking.ts`
- Args:
  - `limit` (optional) — type=int; default=20
- Example: `opencli bilibili ranking -f json`

### search
- Description: Search Bilibili videos or users
- Risk: low
- Source: `src/clis/bilibili/search.ts`
- Args:
  - `query` (required) — Search keyword
  - `type` (optional) — default='video'; video or user
  - `page` (optional) — type=int; default=1; Result page
  - `limit` (optional) — type=int; default=20; Number of results
- Example: `opencli bilibili search -f json`

### subtitle
- Description: 获取 Bilibili 视频的字幕
- Risk: low
- Source: `src/clis/bilibili/subtitle.ts`
- Args:
  - `bvid` (required)
  - `lang` (optional) — 字幕语言代码 (如 zh-CN, en-US, ai-zh)，默认取第一个
- Example: `opencli bilibili subtitle -f json`

### user-videos
- Description: 查看指定用户的投稿视频
- Risk: low
- Source: `src/clis/bilibili/user-videos.ts`
- Args:
  - `uid` (required) — User UID or username
  - `limit` (optional) — type=int; default=20; Number of results
  - `order` (optional) — default='pubdate'; Sort: pubdate, click, stow
  - `page` (optional) — type=int; default=1; Page number
- Example: `opencli bilibili user-videos -f json`
