# 即梦AI (Jimeng)

**Mode**: 🔐 Browser · **Domain**: `jimeng.jianying.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli jimeng generate` | 即梦AI 文生图 — 输入 prompt 生成图片 |
| `opencli jimeng history` | 查看生成历史 |
| `opencli jimeng balance` | 查看积分余额与会员信息 |

## Usage Examples

```bash
# Generate an image
opencli jimeng generate --prompt "一只在星空下的猫"

# Use a specific model
opencli jimeng generate --prompt "cyberpunk city" --model high_aes_general_v50

# Set custom wait timeout
opencli jimeng generate --prompt "sunset landscape" --wait 60

# View generation history
opencli jimeng history --limit 10

# Check credit balance (JSON output)
opencli jimeng balance -f json
```

### Output Fields (balance)

| Field | Description |
|-------|-------------|
| `total` | 剩余积分总数 |
| `vip_credit` | 订阅积分（来自会员套餐每月发放） |
| `purchase_credit` | 充值积分（购买的积分） |
| `gift_credit` | 赠送积分（活动/每日赠送） |
| `vip_level` | 会员等级：高级会员 / 标准会员 / 基础会员 / free |
| `vip_expire` | 会员到期时间 |

### Options (generate)

| Option | Description |
|--------|-------------|
| `--prompt` | Image description prompt (required) |
| `--model` | Model: `high_aes_general_v50` (5.0 Lite), `high_aes_general_v42` (4.6), `high_aes_general_v40` (4.0) |
| `--wait` | Wait seconds for generation (default: 40) |

## Prerequisites

- Chrome running and **logged into** jimeng.jianying.com
- [Browser Bridge extension](/guide/browser-bridge) installed
