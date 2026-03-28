# youtube

## Commands

### search
- Purpose: Search YouTube videos
- Args:
  - `query`(required): Search query
  - `limit`(optional): type: int; default: 20; Max results (max 50)
- Usage: `opencli youtube search [options] -f json`

### transcript
- Purpose: Get YouTube video transcript/subtitles
- Args:
  - `url`(required): YouTube video URL or video ID
  - `lang`(optional): Language code (e.g. en, zh-Hans). Omit to auto-select
  - `mode`(optional): default: 'grouped'; Output mode: grouped (readable paragraphs) or raw (every segment)
- Usage: `opencli youtube transcript [options] -f json`

### video
- Purpose: Get YouTube video metadata (title, views, description, etc.)
- Args:
  - `url`(required): YouTube video URL or video ID
- Usage: `opencli youtube video [options] -f json`
