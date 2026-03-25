# boss

Auto-generated from `src/clis/boss` source files.

Total commands: **14**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### batchgreet
- Description: BOSS直聘批量向推荐候选人发送招呼
- Risk: low
- Source: `src/clis/boss/batchgreet.ts`
- Args:
  - `job-id` (optional) — default=''; Filter by encrypted job ID (greet all jobs if empty)
  - `limit` (optional) — type=int; default=5; Max candidates to greet
  - `text` (optional) — default=''; Custom greeting message (uses default if empty)
- Example: `opencli boss batchgreet -f json`

### chatlist
- Description: BOSS直聘查看聊天列表（招聘端）
- Risk: low
- Source: `src/clis/boss/chatlist.ts`
- Args:
  - `page` (optional) — type=int; default=1; Page number
  - `limit` (optional) — type=int; default=20; Number of results
  - `job-id` (optional) — default='0'; Filter by job ID (0=all)
- Example: `opencli boss chatlist -f json`

### chatmsg
- Description: BOSS直聘查看与候选人的聊天消息
- Risk: low
- Source: `src/clis/boss/chatmsg.ts`
- Args:
  - `uid` (required) — Encrypted UID (from chatlist)
  - `page` (optional) — type=int; default=1; Page number
- Example: `opencli boss chatmsg -f json`

### detail
- Description: BOSS直聘查看职位详情
- Risk: low
- Source: `src/clis/boss/detail.ts`
- Args:
  - `security-id` (required) — Security ID from search results (securityId field)
- Example: `opencli boss detail -f json`

### exchange
- Description: BOSS直聘交换联系方式（请求手机/微信）
- Risk: low
- Source: `src/clis/boss/exchange.ts`
- Args:
  - `uid` (required) — Encrypted UID of the candidate
  - `type` (optional) — default='phone'; Exchange type: phone or wechat
- Example: `opencli boss exchange -f json`

### greet
- Description: BOSS直聘向新候选人发送招呼（开始聊天）
- Risk: low
- Source: `src/clis/boss/greet.ts`
- Args:
  - `uid` (required) — Encrypted UID of the candidate (from recommend)
  - `security-id` (required) — Security ID of the candidate
  - `job-id` (required) — Encrypted job ID
  - `text` (optional) — default=''; Custom greeting message (uses default template if empty)
- Example: `opencli boss greet -f json`

### invite
- Description: BOSS直聘发送面试邀请
- Risk: low
- Source: `src/clis/boss/invite.ts`
- Args:
  - `uid` (required) — Encrypted UID of the candidate
  - `time` (required) — Interview time (e.g. 2025-04-01 14:00)
  - `address` (optional) — default=''; Interview address (uses saved address if empty)
  - `contact` (optional) — default=''; Contact person name (uses saved contact if empty)
- Example: `opencli boss invite -f json`

### joblist
- Description: BOSS直聘查看我发布的职位列表
- Risk: low
- Source: `src/clis/boss/joblist.ts`
- Args: none declared
- Example: `opencli boss joblist -f json`

### mark
- Description: BOSS直聘给候选人添加标签
- Risk: low
- Source: `src/clis/boss/mark.ts`
- Args:
  - `uid` (required) — Encrypted UID of the candidate
  - `label` (required) — Label name (新招呼/沟通中/已约面/已获取简历/已交换电话/已交换微信/不合适/收藏) or label ID
  - `remove` (optional) — type=boolean; default=false; Remove the label instead of adding
- Example: `opencli boss mark -f json`

### recommend
- Description: BOSS直聘查看推荐候选人（新招呼列表）
- Risk: low
- Source: `src/clis/boss/recommend.ts`
- Args:
  - `limit` (optional) — type=int; default=20; Number of results to return
- Example: `opencli boss recommend -f json`

### resume
- Description: BOSS直聘查看候选人简历（招聘端）
- Risk: low
- Source: `src/clis/boss/resume.ts`
- Args:
  - `uid` (required) — Encrypted UID of the candidate (from chatlist)
- Example: `opencli boss resume -f json`

### search
- Description: BOSS直聘搜索职位
- Risk: low
- Source: `src/clis/boss/search.ts`
- Args:
  - `query` (required) — Search keyword (e.g. AI agent, 前端)
  - `city` (optional) — default='北京'; City name or code (e.g. 杭州, 上海, 101010100)
  - `experience` (optional) — default=''; Experience: 应届/1年以内/1-3年/3-5年/5-10年/10年以上
  - `degree` (optional) — default=''; Degree: 大专/本科/硕士/博士
  - `salary` (optional) — default=''; Salary: 3K以下/3-5K/5-10K/10-15K/15-20K/20-30K/30-50K/50K以上
  - `industry` (optional) — default=''; Industry code or name (e.g. 100020, 互联网)
  - `page` (optional) — type=int; default=1; Page number
  - `limit` (optional) — type=int; default=15; Number of results
- Example: `opencli boss search -f json`

### send
- Description: BOSS直聘发送聊天消息
- Risk: low
- Source: `src/clis/boss/send.ts`
- Args:
  - `uid` (required) — Encrypted UID of the candidate (from chatlist)
  - `text` (required) — Message text to send
- Example: `opencli boss send -f json`

### stats
- Description: BOSS直聘职位数据统计
- Risk: low
- Source: `src/clis/boss/stats.ts`
- Args:
  - `job-id` (optional) — default=''; Encrypted job ID (show all if empty)
- Example: `opencli boss stats -f json`
