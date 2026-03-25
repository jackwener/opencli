# weixin

Auto-generated from `src/clis/weixin` source files.

Total commands: **1**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### download
- Description: 下载微信公众号文章为 Markdown 格式
- Risk: low
- Source: `src/clis/weixin/download.ts`
- Args:
  - `url` (required) — WeChat article URL (mp.weixin.qq.com/s/xxx)
  - `output` (optional) — default='./weixin-articles'; Output directory
  - `download-images` (optional) — type=boolean; default=true; Download images locally
- Example: `opencli weixin download -f json`
