# 豁免/容忍登记 — 2026-04-17

本文件按 CLAUDE.md §4.4 记录本次依赖锁定中的两项合规偏离，**每项都给出豁免依据、影响评估和撤销条件**。

---

## 1. `undici@7.24.8` — §4.2 90-天规则豁免（EXEMPT）

### 基本事实

| 项目 | 值 |
|------|---|
| 类型 | 生产依赖（dependencies） |
| 本应锁定的合规版本 | `undici@7.18.2`（101 天） |
| 实际锁定版本 | `undici@7.24.8` |
| 实际发布时间 | 2026-04-12（**4 天**） |
| 违反规则 | CLAUDE.md §4.2 准入检查第 2 条（发布 ≥90 天） |

### 豁免依据（§4.4）

> **§4.4 豁免条件**：jdy 明确授权时可跳过 3 个月限制（如**安全补丁等紧急场景**）

本豁免属于"安全补丁紧急场景"：

`undici@7.18.2` 位于 6 个 GitHub Advisory 的受影响范围：

| GHSA | 严重度 | 描述 | 修复版本 |
|------|--------|------|---------|
| GHSA-f269-vfmq-vjvj | HIGH | WebSocket 64-bit length 溢出，parser 崩 | 7.24.0 |
| GHSA-2mjp-6q6p-2qxm | HIGH | HTTP Request/Response Smuggling | 7.24.0 |
| GHSA-vrm6-8vpv-qv8q | HIGH | WebSocket permessage-deflate 解压内存耗尽 | 7.24.0 |
| GHSA-v9p9-hfj2-hcw8 | HIGH | WebSocket 无效 server_max_window_bits 未处理异常 | 7.24.0 |
| GHSA-4992-7rv2-5pvq | HIGH | CRLF 注入 via `upgrade` option | 7.24.0 |
| GHSA-phc3-fgpg-7m6h | HIGH | DeduplicationHandler 无界内存 DoS | 7.24.0 |

**影响路径（为什么对本项目是 relevant）**：
- `src/node-network.ts` 用 `undici` 的 `fetch` 做代理转发
- `clis/xiaohongshu/download.js` 通过 opencli 的 `downloadMedia` 走 HTTP 下载，涉及底层 HTTP 实现
- 6 个 CVE 里至少 2 个（HTTP Smuggling、CRLF Injection）在真实场景下可被攻击者利用

**矛盾现实**：
- undici 6.x ≤ 6.23.0 全部在受影响范围（< 6.24.0）
- undici 7.x ≤ 7.18.2 全部在受影响范围（< 7.24.0）
- 所有"合规（≥90d）且已修复 CVE"的 undici 版本**不存在**
- 上游 `^8.0.2` 原本解析到的 `undici@8.1.0` 是 CVE-free 版本，但 <90d 也不合规

### 附加合规检查（§4.4 要求仍做 §4.2 第 1/4/5 项）

| 检查 | 结果 |
|------|------|
| 1. 包身份（typosquat） | ✅ `nodejs/undici`，维护者 Matteo Collina (Node.js TSC) + ronag + ethan_arrowood |
| 4. lifecycle scripts | ✅ `hasInstallScript: false`（无 preinstall/install/postinstall） |
| 5. lockfile integrity | ✅ 已锁 sha512 |

### 撤销条件

满足以下**任一**时，应撤销此豁免（回归 §4.2 常规流程）：

- `undici@7.24.x` 有任何版本跨过 90 天门槛（即 2026-07-17 附近）→ 可视为"常规版本"，去掉 §4.4 标签但保留当前版本号或升级
- `undici@8.x` 有任何版本跨过 90 天门槛 → 评估是否升级到主版本 8（opencli 只用 4 个稳定 API，应可兼容）
- 2026-07-17 之后，如仍在 7.24.8，将 `.audit/exemptions/` 的此条改为"Expired — now compliant"

### 操作人 / 时间

- 授权人：jdy（2026-04-17 对话中明确选择 "A"）
- 执行人：自动化工具（Claude via executing-plans skill）
- 记录人：同执行人

---

## 2. `vite`（通过 vitepress 引入）— 剩余 CVE 容忍（TOLERATE，非豁免）

### 基本事实

| 项目 | 值 |
|------|---|
| 类型 | **开发依赖传递**（vitepress 1.6.4 → vite ≤6.4.1） |
| 相关 CVE | GHSA-4w7w-66w2-5vf9（Path Traversal in Optimized Deps `.map` Handling，MODERATE） |
| 受影响版本范围 | vite `<=6.4.1`（以及 7.0.0-7.3.1、8.0.0-8.0.4） |
| 修复版本 | `vite@6.4.2`（2026-04-06，10 天） |
| **当前锁定版本** | `vite@6.4.1`（通过 vitepress 1.6.4 的 peer dep 约束，受限） |
| **是否豁免** | ❌ **否** — 不调整版本 |

### 容忍依据（不是豁免）

**关键事实**：CVE 描述为 `Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling`。

触发条件：**运行 `vite dev` / `vitepress dev` 开发服务器时**，恶意客户端构造 `.map` URL 读取服务器文件系统。

本项目用例：
- `vitepress` 在 `package.json` 的 `devDependencies` 中，不进 npm tarball（`files` 字段只含 `dist/`, `clis/`, `cli-manifest.json`, `scripts/`, `README.md`, `LICENSE`）
- 项目使用的是 `npm run docs:build`（vitepress build）和 `docs:preview`（static serve），**不跑 `docs:dev`**
- `vitepress build` 不启 dev server，CVE 的触发路径**在本项目的使用模式下不可达**

### 决策理由

- **不豁免 §4.2**：避免不必要的豁免门扩大（undici 豁免已足够）
- **不升 vite**：
  - vite 6.4.2 是 10 天前发布，同样违反 §4.2
  - vitepress 1.6.4 的 peer dep 约束 vite ≤6.4.1，强制 override 会冒兼容风险
  - 继续保留 vite 6.4.1 不触发 CVE 且稳定
- **不删 vitepress**：保留 docs:build 能力

### 验证范围限定

以下两种 `npm audit` 调用的预期结果不同：

```bash
# 生产审计（验收标准 #3）：必须 0 漏洞
npm audit --omit=dev
# → found 0 vulnerabilities

# 全量审计（含 dev）：已知会报 2 个 moderate (vite 传递)
npm audit
# → 2 moderate severity vulnerabilities (vite path traversal, dev-server-only)
```

### 撤销条件

满足以下**任一**时，应撤销此容忍（改为"资产清单无相关 CVE"状态）：

- vitepress 放出 1.7.x+，允许 vite 6.4.2+（预期 2026 Q3 左右）
- 项目决定启用 `npm run docs:dev`（即使在个人机）—— 此时 CVE 可触发，必须升级或停跑 dev
- vite 6.4.2+ 跨过 90 天门槛（即 2026-07-05 附近）且 vitepress 已放宽约束

### 操作人 / 时间

- 决策人：jdy（2026-04-17 对话中明确选择 "Y"）
- 执行人：同上
- 记录人：同上

---

## 复审节奏

按 CLAUDE.md §4.2 的 3 个月节奏，**2026-07-17** 前须审视此文件的两项状态：

- [ ] undici：是否可取消豁免标签（升级到新的已合规版本）
- [ ] vite：是否已有新 vitepress 放宽约束

复审动作可由 spec §7.8 的季度复审 checklist 统一调度。
