# jimeng

Auto-generated from `src/clis/jimeng` source files.

Total commands: **2**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### generate
- Description: 即梦AI 文生图 — 输入 prompt 生成图片
- Risk: low
- Source: `src/clis/jimeng/generate.yaml`
- Args:
  - `prompt` (required) — type=string; "图片描述 prompt"
  - `model` (optional) — type=string; default="high_aes_general_v50"; "模型: high_aes_general_v50 (5.0 Lite), high_aes_general_v42 (4.6), high_aes_general_v40 (4.0)"
  - `wait` (optional) — type=int; default=40; "等待生成完成的秒数"
- Example: `opencli jimeng generate -f json`

### history
- Description: 即梦AI 查看最近生成的作品
- Risk: low
- Source: `src/clis/jimeng/history.yaml`
- Args:
  - `limit` (optional) — type=int; default=5
- Example: `opencli jimeng history -f json`
