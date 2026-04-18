# jdy 待办清单 — 2026-04-17

本次审计（依赖合规化 + 扩展自编 + 自动化工具）的代码/配置工作已完成。
下列是**无法由 AI 代做**、需要你亲自操作的事项，按建议顺序排列。

预估总时间：**20–30 分钟**（浏览器 + 日历 + 一次首 E2E 下载测试）。

---

## A. 分支整合（必做，5 分钟）

两个并行分支已 commit 到本地，未 push。决定如何进 main：

### A.1 合并到本地 main（推荐）

```bash
cd ~/Documents/open_sources/opencli
git checkout main

# 先合基线审计
git merge --no-ff audit/initial-review \
  -m "merge: 2026-04-17 security audit baseline"

# 再合代码改动
git merge --no-ff security/lock-deps-90d \
  -m "merge: 2026-04-17 deps lock + self-build extension + audit tooling"

# 确认状态
git log --oneline -8
git status
```

预期无冲突（两个分支改的文件不重叠）。

### A.2 是否 push 到 origin？（看 §F 的单独分析）

默认：**暂不 push**（3b 决策）。等你看完 §F 再决定。

---

## B. Renovate GitHub App（必做，3 分钟）— 长期维护的核心自动化

1. 浏览器打开 https://github.com/apps/renovate
2. 点 `Install`
3. 选 `Only select repositories` → 勾 `ken-zy/OpenCLI` → `Install`
4. 等 1–5 分钟，检查 `ken-zy/OpenCLI` 有无新 PR（通常叫 `Configure Renovate`）
5. merge 这个 configure PR，Renovate 正式激活
6. 之后每周一早 9 点，Renovate 会对 ≥90 天的新依赖版本开 PR，人工 review + merge

**验证激活成功**：
```bash
gh pr list --repo ken-zy/OpenCLI --author "app/renovate"
```

---

## C. GitHub 订阅（必做，2 分钟）

**C.1 订阅上游 releases + security alerts**
- 浏览器：https://github.com/jackwener/opencli
- 右上角 `Watch` → `Custom` → ☑️ **Releases** ☑️ **Security alerts**
- 不勾 Issues/PRs（噪音太大）

**C.2 订阅安全公告页面**
- https://github.com/jackwener/opencli/security/advisories → Watch（如有按钮）

---

## D. 日历季度提醒（必做，3 分钟）— 避免豁免到期被遗忘

在你用的日历 app（Apple Calendar / Fantastical / Google Calendar 等）新建：

- **事件名**：季度复审 opencli 依赖 + 豁免状态
- **首次日期**：`2026-07-17`（undici 豁免 90d 到期点，也是首次季度复审）
- **重复**：每 3 个月
- **提前提醒**：1 天
- **备注**（复制粘贴）：
  ```
  cd ~/Documents/open_sources/opencli
  git checkout main
  ./scripts/audit/upstream-check.sh
  node scripts/audit/check-dep-age.mjs
  node scripts/audit/check-dep-age.mjs extension

  必读:
  - .audit/exemptions/2026-04-17-undici-vite.md  (是否可撤销豁免)
  - .audit/specs/2026-04-17-opencli-safe-usage-design.md §7.8

  动作:
  - undici 是否可升到 >=90d 的新版本
  - vite 是否有新 patch + vitepress 是否放宽约束
  - TS 5 -> 6 是否值得升
  ```

---

## E. 隔离 Chrome profile + 首次 E2E（必做，15 分钟）

### E.1 创建专用 profile

```bash
mkdir -p ~/.chrome-profiles/xhs
```

### E.2 启动 Chrome 专用 profile

**macOS**：
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir=$HOME/.chrome-profiles/xhs &
```

**验证是新 profile**：
- 访问 `chrome://version` → 看 `Profile Path` 应含 `.chrome-profiles/xhs`
- `chrome://settings` → 未登录任何 Google 账号
- 没有任何书签、历史、扩展

### E.3 Load unpacked 自编扩展

在该 Chrome 窗口里：
1. 访问 `chrome://extensions`
2. 右上角打开 Developer mode
3. 点左上 `Load unpacked`
4. 选择 `~/Documents/open_sources/opencli/extension/`（**整个目录，不是 dist**）
5. 看卡片出现 "OpenCLI" + version

**重要**：记录扩展 ID（形如 `abcd1234...`）：
```bash
echo "扩展装于 $(date): <粘贴 extension ID>" \
  >> .audit/reports/extension-install-log.txt
```

### E.4 登录小红书

1. 在该 Chrome 访问 https://www.xiaohongshu.com
2. 扫码登录（或账密）
3. **关键：不登录任何其他站**（淘宝/微博/B 站/GitHub 都必须是未登录态）
4. 访问你的个人主页，确认能看到只有自己才能看到的内容（编辑按钮等）

### E.5 opencli 环境准备 + 首次下载

```bash
cd ~/Documents/open_sources/opencli
git checkout main            # 分支应已合好（A 步骤）
npm link                     # 把 opencli 指向当前 fork
which opencli                # 应指向 ./dist/src/main.js
opencli doctor               # 应见 daemon running + extension connected
```

首次下载（计时）：
```bash
# 1. 在专用 Chrome 里找一篇含 5+ 图的笔记，复制完整 URL (含 ?xsec_token=...)
# 2. 跑
mkdir -p ./xhs-test
time opencli xiaohongshu download '<粘贴 URL>' --output ./xhs-test
```

**验收**：
- 退出码 0
- 表格列出每张图 index/type/status/size
- `real` 时间 **< 30 秒**（理想 5–15 秒）
- `./xhs-test/` 下有原图（JPEG，> 50KB 每张）

记录：
```bash
echo "首次 E2E $(date): N 图耗时 <real 值>" >> .audit/reports/e2e-runs.txt
```

---

## F. 是否 push + 开 PR review？（决策）

这是 jdy 提的问题，下面是客观分析。

### 你的 fork 当前状态
- `ken-zy/OpenCLI`：**public**（公开可见）
- Actions：**已启用**（`allowed_actions: all`）
- 两个本地分支（`audit/initial-review` + `security/lock-deps-90d`）**均未 push**

### Workflow trigger 预期（push 两个分支 + 开 PR to main）
| workflow | 会触发 | 风险 |
|---------|-------|------|
| `ci.yml` | ✅ push/PR | 低 — 跑 typecheck + tests |
| `build-extension.yml` | ✅（extension/ path 变了） | 低 — 跑 vite build |
| `doc-check.yml` | ✅ PR 触发 | 低 — 文档检查 |
| `e2e-headed.yml` | ✅（extension/ 变了） | **中** — 需要 headed Chrome runner 资源 |
| `security.yml` | ✅ | 低 — GitHub 自带 scan |
| `docs.yml` | ❌（只对 main push + docs/ path） | — |
| `release.yml` | ❌（只对 push tag v*） | — |

**不会意外发布 npm**（release.yml 只 tag 触发）。**不会影响上游**（PR 都是 fork 内部）。

### 四个选项

| 选项 | 描述 | 好处 | 代价 |
|------|------|------|------|
| **F1** | 本地合，不 push | 最简单 | 失去 GitHub diff view + CI 验证 + 异地备份 |
| **F2** | push 两分支 + 不开 PR | 有 backup，简单 | 会触发 push-trigger 的 CI（ci.yml/build-extension/security） |
| **F3** | push + 开 **draft PR** | backup + GitHub diff review + CI 跑完 | 要看 4–5 个 workflow 结果 |
| **F4** | push + 开正式 PR + merge | 走最正式流程 | merge 后 commit 到 fork main（会影响你 fork 的 main 状态） |

### 我的推荐：**F3（draft PR）**

**理由**：
- GitHub diff view 比本地 git diff 易读很多（特别是 package-lock.json 的巨大改动）
- Actions 自动跑 typecheck + tests，是**第二重验证**（虽然本地已跑过）
- draft 状态不会 merge，安全
- 看完 CI 结果没问题后，**本地 merge**（执行 §A），**不从 PR merge**
- PR 保留作为"本次审计工作记录"，未来查看方便
- fork 是 public，已经是公开状态，push 不降级隐私

**draft PR 开法**：
```bash
# 先 push 两个分支
git push origin audit/initial-review
git push origin security/lock-deps-90d

# 开 draft PR（从 security 分支到 main；audit 分支先不开）
gh pr create \
  --base main --head security/lock-deps-90d \
  --draft \
  --title "deps(security): exact-version lock + rollback 7 pkgs to >=90d (审计 2026-04-17)" \
  --body-file .audit/plans/2026-04-17-opencli-safe-usage-plan.md

# 等 CI 跑完 (约 10-20 分钟)
gh pr checks
gh pr view --web
```

CI 全绿后：
- 不点 PR 上的 merge 按钮
- 本地 merge（§A）
- draft PR 可以留着，或 `gh pr close`

### 不推荐 F4 的原因
如果从 PR merge 到 main，main 上会少一个 merge commit（GitHub 的 squash/merge 策略可能把多个 commit 合成 1 个），丢失逐 commit 的 blame 历史。本地 `--no-ff` merge 保留所有 commit。

### 如果你倾向 F1
完全合理，就按 §A 操作，跳过这一节。

---

## 完成后的状态

- [x] 所有代码改动已合入 main（§A）
- [x] Renovate 自动监测上线（§B）
- [x] GitHub Watch 已订阅（§C）
- [x] 日历季度提醒已配（§D）
- [x] 隔离 profile + 扩展 + 小红书登录 + 首次 E2E 成功 < 30s（§E）
- [ ] PR 决策已执行（§F，任选一个或忽略）

---

## 附：关联材料索引

- 设计：`.audit/specs/2026-04-17-opencli-safe-usage-design.md`
- 实施计划（完整）：`.audit/plans/2026-04-17-opencli-safe-usage-plan.md`
- 安全报告：`.audit/reports/20260417-130748.json`
- 豁免登记：`.audit/exemptions/2026-04-17-undici-vite.md`
- 依赖扫描：`.audit/reports/npm-audit-full-20260417.txt`
- 工具：`scripts/audit/upstream-check.sh` + `scripts/audit/check-dep-age.mjs`
- 自动化：`renovate.json`
