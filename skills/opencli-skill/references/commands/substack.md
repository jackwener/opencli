# substack

## Commands

### feed
- Purpose: Substack trending feed
- Args:
  - `category`(optional): default: 'all'; Category: all, tech, business, culture, politics, science, health
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli substack feed [options] -f json`

### publication
- Purpose: Get latest posts from a specific Substack newsletter
- Args:
  - `url`(required): Newsletter URL (e.g. https://example.substack.com)
  - `limit`(optional): type: int; default: 20; Number of articles to return
- Usage: `opencli substack publication [options] -f json`

### search
- Purpose: Search Substack posts and newsletters
- Args:
  - `keyword`(required): Search keyword
  - `type`(optional): default: 'posts'; Search type (posts or publications)
  - `limit`(optional): type: int; default: 20; Number of results to return
- Usage: `opencli substack search [options] -f json`
