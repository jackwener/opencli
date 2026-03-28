---
name: cross-project-adapter-migration
description: "Cross-project CLI command migration workflow for opencli. Use when importing commands from external CLI projects (python/node) like rdt-cli, twitter-cli, etc. Covers: source analysis → gap matrix → batch migration → README/SKILL.md update."
---

# Cross-Project Adapter Migration

> 从外部 CLI 项目（Python/Node/Go 等）批量迁移命令到 opencli 的标准化流程。

## When to Use

- 用户说"把 xxx-cli 的命令迁移过来"
- 用户说"看看 xxx 项目有什么可以借鉴的"
- 用户说"对齐 xxx-cli 的功能"
- 在为新平台扩展 opencli 时，发现已有第三方 CLI 工具

## Prerequisites

- 熟悉 [CLI-EXPLORER.md](../../../CLI-EXPLORER.md)（adapter 开发决策树）
- 熟悉 [SKILL.md](../../../SKILL.md)（命令参考 & 模板）

---

## Phase 1: 源项目分析

### 1.1 克隆 & 理解源项目

```bash
# 克隆源项目到 /tmp 做分析
git clone <source_repo_url> /tmp/<source-cli>
```

分析重点：
- **命令列表**：找到所有可用命令（查看 CLI 入口文件、help 输出或 README）
- **认证方式**：Cookie？API Key？OAuth？浏览器自动化？
- **数据源**：公开 API？GraphQL？页面抓取？
- **输出字段**：每个命令返回哪些数据字段

### 1.2 生成命令清单

列出源项目所有命令，包括：

| 命令 | 类型 | API/方法 | 输出字段 |
|------|------|---------|---------|
| `xxx feed` | Read | `GET /api/feed` | title, author, time |
| `xxx post` | Write | `POST /api/tweet` | status, id |

---

## Phase 2: 功能对比矩阵

### 2.1 查看 opencli 现有命令

```bash
ls src/clis/<site>/     # 查看已有适配器
opencli list | grep <site>  # 确认已注册命令
```

### 2.2 生成对比矩阵

对每个源项目命令，标注三种状态：

| 功能 | 源项目 | opencli 现有 | 行动 |
|------|--------|-------------|------|
| feed | ✅ `xxx feed` | ❌ 无 | ✅ **新增** |
| search | ✅ `xxx search` | ✅ `search.ts` | ❌ 已有，跳过 |
| hot | ✅ `xxx hot` | ⚠️ `hot.yaml`（不完整） | ✅ **增强** |
| like | ✅ `xxx like` | ✅ `like.ts` | ❌ 已有，跳过 |

### 2.3 筛选迁移目标

去掉已有的、低价值的，保留高价值缺失命令，按 Read/Write 分类：

**筛选原则**：
- ✅ 高使用频率的命令优先
- ✅ 已有但不完整的命令标记为"增强"
- ❌ 源项目特有但 opencli 架构不支持的功能（如需要持久化存储的）跳过
- ❌ 与现有功能完全重复的跳过

---

## Phase 3: 批量实现

> [!IMPORTANT]
> 实现前必须查阅 [CLI-EXPLORER.md](../../../CLI-EXPLORER.md) 确认策略选择。

### 3.1 选择实现方式

基于决策树分类：

| 类别 | 方式 | 适用条件 |
|------|------|---------|
| **Read + 简单 API** | YAML pipeline | 纯 fetch/select/map，无复杂 JS |
| **Read + GraphQL/分页/签名** | TypeScript adapter | 需要 JS 逻辑 |
| **Write 操作** | TypeScript + `Strategy.UI` | 点击/输入等 DOM 操作 |
| **Write + API** | TypeScript + `Strategy.COOKIE/HEADER` | 直接 POST API |

### 3.2 实现顺序

**先 Read 后 Write，先 YAML 后 TS**：

1. **Phase A**: YAML Read 适配器（最快，通常每个 10-20 行）
2. **Phase B**: TS Read 适配器（需要 evaluate/intercept 的）
3. **Phase C**: TS Write 适配器（需 UI 自动化或 POST API）

### 3.3 实现模板

#### YAML Read 适配器模板（Cookie 策略）

```yaml
site: <site>
name: <command>
description: <描述>
domain: www.<site>.com
strategy: cookie
browser: true

args:
  limit:
    type: int
    default: 20

pipeline:
  - navigate: https://www.<site>.com
  - evaluate: |
      (async () => {
        const res = await fetch('<api_endpoint>', { credentials: 'include' });
        const d = await res.json();
        return (d.data?.items || []).map(item => ({
          title: item.title,
          // ... map source fields
        }));
      })()
  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
  - limit: ${{ args.limit }}

columns: [rank, title]
```

#### TS Write 适配器模板（UI 策略）

```typescript
import { cli, Strategy } from '../../registry.js';

cli({
  site: '<site>',
  name: '<command>',
  description: '<描述>',
  strategy: Strategy.UI,
  args: [{ name: 'target', required: true, help: '<参数说明>' }],
  columns: ['status', 'message'],
  func: async (page, kwargs) => {
    await page.goto(`https://www.<site>.com/${kwargs.target}`);
    await page.wait({ text: '<expected_text>', timeout: 10 });

    // 获取 snapshot 找到目标按钮
    const snapshot = await page.accessibility.snapshot();
    // 点击按钮 ...

    return [{ status: 'success', message: '<action> completed' }];
  },
});
```

### 3.4 公共模式复用

迁移过程中如果发现多个适配器共享逻辑，考虑提取到 `src/clis/<site>/utils.ts` 工具文件：

```typescript
// src/clis/<site>/utils.ts
export async function fetchWithAuth(page, url) { ... }
export function parseItem(raw) { ... }
```

---

## Phase 4: 验证 & 发布

### 4.1 构建验证

```bash
npx tsc --noEmit                    # TypeScript 编译检查
opencli list | grep <site>          # 确认所有命令已注册
```

### 4.2 运行验证（关键！）

每个新命令必须实际运行：

```bash
# Read 命令
opencli <site> <command> --limit 3 -f json
opencli <site> <command> --limit 3 -v   # verbose 查看 pipeline

# Write 命令（谨慎！会实际操作）
opencli <site> <command> <test_target>
```

### 4.3 更新文档

迁移完成后必须更新以下文件：

1. **README.md** — 在对应平台区域添加新命令示例
2. **SKILL.md** — 在 Commands Reference 中添加新命令

### 4.4 提交 & 推送

```bash
git add -A
git commit -m "feat(<site>): migrate <N> commands from <source-cli>

- Phase A: <N> YAML adapters (read operations)
- Phase B: <N> TS adapters (write operations)
- Source: <source_repo_url>"
git push
```

---

## Checklist

- [ ] 源项目命令清单已生成
- [ ] 对比矩阵已确认，高价值缺失命令已筛选
- [ ] 用户确认迁移范围
- [ ] Phase A: YAML Read 适配器已完成
- [ ] Phase B: TS Read 适配器已完成
- [ ] Phase C: TS Write 适配器已完成
- [ ] `npx tsc --noEmit` 编译通过
- [ ] 所有新命令已实际运行验证
- [ ] README.md 已更新
- [ ] SKILL.md 已更新
- [ ] 已 commit + push

## 实战案例参考

### rdt-cli → opencli Reddit（2026-03-16）

- **源项目**: `rdt-cli`（25 个 Python 命令）
- **筛选结果**: 13 个高价值命令
- **实现**: 7 个 YAML（read） + 6 个 TS（write）
- **产出**: +11 文件，+767 行代码，Reddit 适配器从 4 → 15（+275%）

### twitter-cli → opencli Twitter（2026-03-16）

- **源项目**: `twitter-cli`（20+ Python 命令）
- **筛选结果**: 11 个待实现
- **策略**: Read 用 `Strategy.COOKIE` + GraphQL fetch，Write 用 `Strategy.UI`
