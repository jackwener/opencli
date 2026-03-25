# xueqiu

## Commands

### earnings-date
- Purpose: Get expected earnings release dates
- Args:
  - `symbol`(required): type: str; Stock symbol, e.g. SH600519, SZ000858, 00700
  - `next`(optional): type: bool; default: false; Return only the nearest upcoming earnings date
  - `limit`(optional): type: int; default: 10; Number of results, default 10
- Usage: `opencli xueqiu earnings-date [options] -f json`

### feed
- Purpose: Get Xueqiu home feed (followed users)
- Args:
  - `page`(optional): type: int; default: 1; Page number, default 1
  - `limit`(optional): type: int; default: 20; Items per page, default 20
- Usage: `opencli xueqiu feed [options] -f json`

### hot
- Purpose: Get Xueqiu hot feed
- Args:
  - `limit`(optional): type: int; default: 20; Number of results, default 20, max 50
- Usage: `opencli xueqiu hot [options] -f json`

### hot-stock
- Purpose: Get Xueqiu hot stocks ranking
- Args:
  - `limit`(optional): type: int; default: 20; Number of results, default 20, max 50
  - `type`(optional): type: str; default: "10"; Ranking type: 10=popularity (default), 12=watchlist
- Usage: `opencli xueqiu hot-stock [options] -f json`

### search
- Purpose: Search Xueqiu stocks (ticker or name)
- Args:
  - `query`(required): type: str; Search keyword, e.g. Moutai, AAPL, Tencent
  - `limit`(optional): type: int; default: 10; Number of results, default 10
- Usage: `opencli xueqiu search [options] -f json`

### stock
- Purpose: Get Xueqiu real-time quote
- Args:
  - `symbol`(required): type: str; Stock symbol, e.g. SH600519, SZ000858, AAPL, 00700
- Usage: `opencli xueqiu stock [options] -f json`

### watchlist
- Purpose: Get Xueqiu watchlist
- Args:
  - `category`(optional): type: str # using str to prevent parsing issues like 01; default: "1"; Category: 1=watchlist (default), 2=positions, 3=following
  - `limit`(optional): type: int; default: 100; default 100
- Usage: `opencli xueqiu watchlist [options] -f json`
