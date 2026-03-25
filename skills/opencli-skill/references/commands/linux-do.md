# linux-do

## Commands

### categories
- Purpose: linux.do category list
- Args:
  - `limit`(optional): type: int; default: 20; Number of categories
- Usage: `opencli linux-do categories [options] -f json`

### category
- Purpose: linux.do topics in a category
- Args:
  - `slug`(required): type: str; Category slug (use 'categories' command to find)
  - `id`(required): type: int; Category ID (use 'categories' command to find)
  - `limit`(optional): type: int; default: 20; Number of topics
- Usage: `opencli linux-do category [options] -f json`

### hot
- Purpose: linux.do hot topics
- Args:
  - `limit`(optional): type: int; default: 20; Number of topics
  - `period`(optional): type: str; default: weekly; Time period
- Usage: `opencli linux-do hot [options] -f json`

### latest
- Purpose: linux.do latest topics
- Args:
  - `limit`(optional): type: int; default: 20; Number of topics
- Usage: `opencli linux-do latest [options] -f json`

### search
- Purpose: Search linux.do
- Args:
  - `query`(required): type: str; Search query
  - `limit`(optional): type: int; default: 20; Number of results
- Usage: `opencli linux-do search [options] -f json`

### topic
- Purpose: linux.do topic detail with replies (homepage scope)
- Args:
  - `id`(required): type: int; Topic ID
- Usage: `opencli linux-do topic [options] -f json`
