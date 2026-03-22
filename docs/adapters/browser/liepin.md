# 猎聘 (Liepin)

**Mode**: 🔐 Browser · **Domain**: `h.liepin.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli liepin search` | 搜索候选人简历 |

## Usage Examples

```bash
# 基础搜索
opencli liepin search "前端工程师"

# 按城市和学历筛选
opencli liepin search "Java" --city 上海 --degree 本科

# 按工作年限筛选
opencli liepin search "产品经理" --experience 3-5

# 按活跃度筛选（近7天活跃）
opencli liepin search "数据分析" --active 7天

# 多页抓取
opencli liepin search "算法工程师" --pages 3

# JSON 输出（含完整结构化字段）
opencli liepin search "前端工程师" -f json

# YAML 输出
opencli liepin search "前端工程师" -f yaml

# 限制返回数量
opencli liepin search "运营" --limit 20
```

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `keyword` | *(required)* | 搜索关键词（职位/技能/公司名）|
| `--city` | | 期望城市，如 北京、上海、深圳 |
| `--experience` | | 工作年限：1-3 / 3-5 / 5-10 / 10以上 |
| `--degree` | | 学历：大专 / 本科 / 硕士 / 博士 |
| `--active` | | 活跃度：当天 / 3天 / 7天 / 30天 / 90天 |
| `--page` | `0` | 起始页码（从 0 开始）|
| `--pages` | `1` | 抓取页数（每页约 15 条）|
| `--limit` | `0` | 返回数量上限（0 = 不限）|
| `--delay` | `2` | 翻页间隔秒数 |

## Output Fields (JSON/YAML)

| Field | Description |
|-------|-------------|
| `summary` | 多行摘要（适合 table 视图）|
| `id` | 简历 ID |
| `name` | 姓名 |
| `sex` | 性别 |
| `age` | 年龄 |
| `city` | 期望城市 |
| `degree` | 学历 |
| `experience` | 工作年限 |
| `active` | 活跃状态 |
| `updated` | 简历更新日期 |
| `currentTitle` | 当前职位 |
| `currentCompany` | 当前公司 |
| `wantJob` | 期望职位 |
| `skills` | 技能标签数组 |
| `workHistory` | 工作经历数组（start/end/company/title/duration）|
| `education` | 教育经历数组（school/major/degree）|

## Prerequisites

- Chrome 运行中并已**登录** h.liepin.com（HR/猎头端）
- 安装 [Browser Bridge extension](/guide/browser-bridge)
