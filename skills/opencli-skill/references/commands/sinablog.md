# sinablog

## Commands

### article
- Purpose: Get a Sina Blog article detail
- Args:
  - `url`(required): Article URL (e.g. https://blog.sina.com.cn/s/blog_xxx.html)
- Usage: `opencli sinablog article [options] -f json`

### hot
- Purpose: Get Sina Blog hot/recommended posts
- Args:
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli sinablog hot [options] -f json`

### search
- Purpose: Search Sina Blog posts (via Sina search)
- Args:
  - `keyword`(required): Search keyword
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli sinablog search [options] -f json`

### user
- Purpose: List posts from a Sina Blog user
- Args:
  - `uid`(required): Sina Blog user ID (e.g. 1234567890)
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli sinablog user [options] -f json`
