# Coverage Matrix

skill 明确承诺能搞定什么、搞不定什么。动手前先看一眼这张表，判断目标站落在哪一格。

---

## 支持（skill 里有对应的招）

| 维度 | 支持 | 走哪节 |
|------|------|-------|
| 页面形态 | 列表页 / 排行页 | `adapter-template.md`（convertible.js / rank.js 类） |
| | 详情页（单对象） | `adapter-template.md`（stock.js / holders.js 类） |
| | 时间序列（K 线 / 分钟线） | `adapter-template.md`（kline.js） |
| | 嵌套列表（列表里含列表） | `adapter-template.md` + `output-design.md` 打平规则 |
| 站点类型 | SPA（React/Vue，JSON XHR） | `site-recon.md` Pattern A + `api-discovery.md` §network |
| | SSR（HTML with inline data） | `site-recon.md` Pattern B + `api-discovery.md` §state |
| | JSONP / push/script[src] | `site-recon.md` Pattern C + `api-discovery.md` §bundle |
| | SPA + 独立 BFF domain | `api-discovery.md` §bundle §suffix |
| 鉴权 | 裸 `fetch()` 拿到 | `Strategy.PUBLIC + browser:false` |
| | cookie | `Strategy.COOKIE + browser:true` + `credentials:'include'` |
| | Bearer + X-Csrf-Token | `Strategy.HEADER` + 在 `page.evaluate` 拼 header |
| | 页面能发但独立 fetch 不行 | `Strategy.INTERCEPT` |
| 字段形态 | 自解释（`title / price / current`） | 直接映射 |
| | 已登记代号 | `field-conventions.md` 查表 |
| | 未登记代号 | `field-decode-playbook.md` 排序键对比法 |
| | 嵌套路径 `data.diff[].f2` | `field-decode-playbook.md` §3 结构差分 |
| 分页 | `page` / `pn` / `pageNum` | `adapter-template.md` 例子 |
| | `cursor` / `next_cursor` | adapter 里 while 循环，收集到 limit |
| | `offset` / `start` | 同上 |
| 响应格式 | JSON | 默认 |
| | JSONP（`?callback=`） | 去掉 callback 参数直接请求，返回仍是 JSON 字符串包裹 |
| | CSV 字符串（eastmoney kline） | `response.split(',')` 按列序解 |
| | HTML 表格（tonghuashun） | `page.evaluate` 里用 `querySelectorAll` 拿 |

---

## 不支持（承认搞不定，skill 不教）

| 场景 | 原因 | 绕开方案 |
|------|------|---------|
| 首次登录获取 token | 需要用户真实输入账密 | 让用户先在 browser session 里手动登录，adapter 拿 cookie 就行 |
| 复杂 anti-bot（captcha） | 反爬拒流量 | 放弃，换同数据的其他站点 |
| 加密字段（客户端 crypto） | 要破解 bundle 逆向 | 换 endpoint；实在不行发请求到 intercept 让页面自己解 |
| WebSocket 流式数据 | 状态管理复杂 | 退回 HTTP 轮询版本（多数站都有） |
| 私有 binary 协议 | 非 HTTP/WS | 不在 skill 范围 |
| 视觉化图表（只有 canvas） | 数据埋在渲染层 | 找对应 API；找不到就放弃 |
| 签名算法涉及静态密钥 | 需要长期跟踪 bundle 变更 | 走 `Strategy.INTERCEPT`，让页面自己发带签名的请求 |
| 频控 / rate-limit 严格 | 多发几次就 429 | adapter 层控并发 + 加退避；但 skill 不解决 |

---

## 决定用不用 skill 的快速自测

三个问题：

1. **数据能在浏览器里看到吗？** 看不到（登录墙 / 付费墙）→ 先解决鉴权，再回来
2. **数据来源是 HTTP/JSON/HTML 之一吗？** 不是（binary / 加密）→ 不在 skill 范围
3. **需不需要每秒推送？** 需要 → 找同数据 HTTP 接口；没有就放弃

三个都 yes 再往下走。
