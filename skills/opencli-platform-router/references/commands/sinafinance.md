# sinafinance

Auto-generated from `src/clis/sinafinance` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### news
- Description: 新浪财经 7x24 小时实时快讯
- Risk: low
- Source: `src/clis/sinafinance/news.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Max results (max 50)
  - `type` (optional) — type=int; default=0; News type: 0=全部 1=A股 2=宏观 3=公司 4=数据 5=市场 6=国际 7=观点 8=央行 9=其它
- Example: `opencli sinafinance news -f json`
