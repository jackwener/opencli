# xueqiu

Auto-generated from `src/clis/xueqiu` source files.

Total commands: **7**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### earnings-date
- Description: 获取股票预计财报发布日期（公司大事）
- Risk: low
- Source: `src/clis/xueqiu/earnings-date.yaml`
- Args:
  - `symbol` (required) — type=str; 股票代码，如 SH600519、SZ000858、00700
  - `next` (optional) — type=bool; default=false; 仅返回最近一次未发布的财报日期
  - `limit` (optional) — type=int; default=10; 返回数量，默认 10
- Example: `opencli xueqiu earnings-date -f json`

### feed
- Description: 获取雪球首页时间线（关注用户的动态）
- Risk: low
- Source: `src/clis/xueqiu/feed.yaml`
- Args:
  - `page` (optional) — type=int; default=1; 页码，默认 1
  - `limit` (optional) — type=int; default=20; 每页数量，默认 20
- Example: `opencli xueqiu feed -f json`

### hot
- Description: 获取雪球热门动态
- Risk: low
- Source: `src/clis/xueqiu/hot.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; 返回数量，默认 20，最大 50
- Example: `opencli xueqiu hot -f json`

### hot-stock
- Description: 获取雪球热门股票榜
- Risk: low
- Source: `src/clis/xueqiu/hot-stock.yaml`
- Args:
  - `limit` (optional) — type=int; default=20; 返回数量，默认 20，最大 50
  - `type` (optional) — type=str; default="10"; 榜单类型 10=人气榜(默认) 12=关注榜
- Example: `opencli xueqiu hot-stock -f json`

### search
- Description: 搜索雪球股票（代码或名称）
- Risk: low
- Source: `src/clis/xueqiu/search.yaml`
- Args:
  - `query` (required) — type=str; 搜索关键词，如 茅台、AAPL、腾讯
  - `limit` (optional) — type=int; default=10; 返回数量，默认 10
- Example: `opencli xueqiu search -f json`

### stock
- Description: 获取雪球股票实时行情
- Risk: low
- Source: `src/clis/xueqiu/stock.yaml`
- Args:
  - `symbol` (required) — type=str; 股票代码，如 SH600519、SZ000858、AAPL、00700
- Example: `opencli xueqiu stock -f json`

### watchlist
- Description: 获取雪球自选股列表
- Risk: low
- Source: `src/clis/xueqiu/watchlist.yaml`
- Args:
  - `category` (optional) — type=str # using str to prevent parsing issues like 01; default="1"; "分类：1=自选(默认) 2=持仓 3=关注"
  - `limit` (optional) — type=int; default=100; 默认 100
- Example: `opencli xueqiu watchlist -f json`
