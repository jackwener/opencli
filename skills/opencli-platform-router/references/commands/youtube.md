# youtube

Auto-generated from `src/clis/youtube` source files.

Total commands: **3**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### search
- Description: Search YouTube videos
- Risk: low
- Source: `src/clis/youtube/search.ts`
- Args:
  - `query` (required) — Search query
  - `limit` (optional) — type=int; default=20; Max results (max 50)
- Example: `opencli youtube search -f json`

### transcript
- Description: Get YouTube video transcript/subtitles
- Risk: low
- Source: `src/clis/youtube/transcript.ts`
- Args: none declared
- Example: `opencli youtube transcript -f json`

### video
- Description: Get YouTube video metadata (title, views, description, etc.)
- Risk: low
- Source: `src/clis/youtube/video.ts`
- Args:
  - `url` (required) — YouTube video URL or video ID
- Example: `opencli youtube video -f json`
