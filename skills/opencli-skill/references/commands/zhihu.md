# zhihu

## Commands

### download
- Purpose: Export Zhihu article to Markdown
- Args:
  - `url`(required): Article URL (zhuanlan.zhihu.com/p/xxx)
  - `output`(optional): default: './zhihu-articles'; Output directory
  - `download-images`(optional): type: boolean; default: false; Download images locally
- Usage: `opencli zhihu download [options] -f json`

### hot
- Purpose: Zhihu hot list
- Args:
  - `limit`(optional): type: int; default: 20; Number of items to return
- Usage: `opencli zhihu hot [options] -f json`

### question
- Purpose: Zhihu question detail and answers
- Args:
  - `id`(required): Question ID (numeric)
  - `limit`(optional): type: int; default: 5; Number of answers
- Usage: `opencli zhihu question [options] -f json`

### search
- Purpose: Search Zhihu
- Args:
  - `query`(required): type: str; Search query
  - `limit`(optional): type: int; default: 10; Number of results
- Usage: `opencli zhihu search [options] -f json`
