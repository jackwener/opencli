# Site Memory

站点记忆分两层：**in-repo 种子**（skill 自带的已知站点公共知识）+ **本地工作目录**（每台机器跑过的站点累积产物）。

---

## 两层结构

```
skills/opencli-adapter-author/references/site-memory/<site>.md
    — 公共种子。手写 + PR 审核进入。多 agent 共享的第一批起点。
    — 已铺：eastmoney / xueqiu / bilibili / tonghuashun

~/.opencli/sites/<site>/
    — 本地累积。agent 跑 adapter 过程里自动写入，跨 session 复用。
    — 不进 git，不进 PR。
```

用法：开头先读本地，命中跳 Step 4；没命中读 in-repo；都没有走完整 recon。

---

## Layer 1 — In-repo 种子（`references/site-memory/<site>.md`）

每个覆盖站点一个 `.md`，结构固定：

```markdown
# <site>

## 域名
主 API / 备 API / 登录 / 静态资源

## 默认鉴权
`Strategy.XXX` + 必需 cookie/header + 获取方式

## 已知 endpoint（选最常用的 5-10 条）
- `GET <url>` — 返回 X，分页参数 Y
- ...

## 字段（指向 `field-conventions.md` 的某一节）

## 坑 / 陷阱
- fltt=2 必传
- 单位是"万"不是"元"
- ...

## 可参考的 adapter
`clis/<site>/<name>.js` × N
```

审核门槛高，里面写的东西必须是"多数人都会踩到"的共识。一次性试错、站点局部怪癖放 Layer 2。

---

## Layer 2 — 本地工作目录（`~/.opencli/sites/<site>/`）

agent 每跑一次相关 adapter 就可以自动写/读：

```
~/.opencli/sites/<site>/
  notes.md               — 累积笔记（时间戳 + 写入人 + 发现）
  endpoints.json         — 已验证的 endpoint 目录
  field-map.json         — 字段代号 → 含义（key 为字段代号，value 为 {meaning, verified_at, source}）
  fixtures/              — 样本响应（给 verify 做 regression 对比）
    <cmd>-<ts>.json
  last-probe.log         — 最近一次侦察输出（下次接着用）
```

### `endpoints.json` 格式

```json
{
  "clist": {
    "url": "https://push2.eastmoney.com/api/qt/clist/get",
    "method": "GET",
    "params": {
      "required": ["fs", "fields"],
      "optional": ["pn", "pz", "fid", "po", "fltt"]
    },
    "response": "data.diff[] 数组",
    "verified_at": "2026-04-20",
    "notes": "fltt=2 必传"
  }
}
```

### `field-map.json` 格式

```json
{
  "f237": {
    "meaning": "convertible premium rate (%)",
    "verified_at": "2026-04-20",
    "source": "field-decode-playbook sort-key comparison vs page"
  }
}
```

### `notes.md` 格式

```markdown
## 2026-04-20 by opencli-user
写 `convertible.js` 时遇到：
- f237 推断是溢价率（排序对比法，页面对照）
- `fltt=2` 不加的话价格是整数 × 10^f152
- `fs=b:MK0354` 过滤可转债
```

---

## runbook 里的读/写时机

```
Step 2 开始前 → 读  ~/.opencli/sites/<site>/
                → 读  references/site-memory/<site>.md
                (命中了就跳过 recon + discovery)

Step 7 verify 通过后 → 写 ~/.opencli/sites/<site>/
                       - endpoints.json 追加新 endpoint
                       - field-map.json 追加新字段
                       - notes.md 追加本次笔记
                       - fixtures/ 存一份响应样本
```

---

## 不要写进 `~/.opencli/sites/` 的东西

- 真实账户 cookie / token — 不要保存任何鉴权凭据
- 用户私有数据（返回体里有个人敏感字段的 → 脱敏再存 fixtures）
- 过期超过 30 天的 last-probe.log（自动清）

---

## 没有 site-memory 时

新站点没对应 `.md`，也没本地目录 → 完整走 recon + discovery，跑完直接写 `~/.opencli/sites/<site>/`，后面就有了。
