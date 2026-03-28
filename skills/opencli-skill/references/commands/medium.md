# medium

## Commands

### feed
- Purpose: Medium trending feed
- Args:
  - `topic`(optional): default: ''; Topic tag (e.g. technology, programming, ai)
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli medium feed [options] -f json`

### search
- Purpose: Search Medium articles
- Args:
  - `keyword`(required): Search keyword
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli medium search [options] -f json`

### user
- Purpose: List articles from a Medium user
- Args:
  - `username`(required): Medium username (e.g. @username or username)
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli medium user [options] -f json`
