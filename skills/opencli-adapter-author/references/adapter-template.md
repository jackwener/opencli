# Adapter Template

一份 adapter 就是一次 `cli({...})` 调用。文件结构固定，三段：declaration、args、func。

拿 `clis/eastmoney/convertible.js` 当活例子，对照拆解。

---

## 活例子：convertible.js

```javascript
// eastmoney convertible — on-market convertible bond listing.
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';

const SORTS = {
  change:   { fid: 'f3',   order: 'desc' },
  drop:     { fid: 'f3',   order: 'asc' },
  turnover: { fid: 'f6',   order: 'desc' },
  price:    { fid: 'f2',   order: 'desc' },
  premium:  { fid: 'f237', order: 'desc' },
  value:    { fid: 'f236', order: 'desc' },
  ytm:      { fid: 'f239', order: 'desc' },
};

cli({
  site: 'eastmoney',
  name: 'convertible',
  description: '可转债行情列表（默认按成交额排序）',
  domain: 'push2.eastmoney.com',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'sort',  type: 'string', default: 'turnover', help: '排序：turnover / change / drop / price / premium' },
    { name: 'limit', type: 'int',    default: 20,         help: '返回数量 (max 100)' },
  ],
  columns: ['rank', 'bondCode', 'bondName', 'bondPrice', 'bondChangePct',
            'stockCode', 'stockName', 'stockPrice', 'stockChangePct',
            'convPrice', 'convValue', 'convPremiumPct', 'remainingYears', 'ytm', 'listDate'],
  func: async (_page, args) => {
    const sortKey = String(args.sort ?? 'turnover').toLowerCase();
    const sort = SORTS[sortKey];
    if (!sort) throw new CliError('INVALID_ARGUMENT', `Unknown sort "${sortKey}". Valid: ${Object.keys(SORTS).join(', ')}`);
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, 100));

    const url = new URL('https://push2.eastmoney.com/api/qt/clist/get');
    url.searchParams.set('pn', '1');
    url.searchParams.set('pz', String(limit));
    url.searchParams.set('po', sort.order === 'desc' ? '1' : '0');
    url.searchParams.set('np', '1');
    url.searchParams.set('fltt', '2');
    url.searchParams.set('invt', '2');
    url.searchParams.set('fid', sort.fid);
    url.searchParams.set('fs', 'b:MK0354');
    url.searchParams.set('fields', 'f12,f14,f2,f3,f6,f229,f230,f232,f234,f235,f236,f237,f238,f239,f243');
    url.searchParams.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281');

    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!resp.ok) throw new CliError('HTTP_ERROR', `convertible failed: HTTP ${resp.status}`);
    const data = await resp.json();
    const diff = Array.isArray(data?.data?.diff) ? data.data.diff : [];
    if (diff.length === 0) throw new CliError('NO_DATA', 'eastmoney returned no convertible data');

    return diff.slice(0, limit).map((it, i) => ({
      rank: i + 1,
      bondCode: it.f12,
      bondName: it.f14,
      bondPrice: it.f2,
      bondChangePct: it.f3,
      stockCode: it.f232,
      stockName: it.f234,
      stockPrice: it.f229,
      stockChangePct: it.f230,
      convPrice: it.f235,
      convValue: it.f236,
      convPremiumPct: it.f237,
      remainingYears: it.f238,
      ytm: it.f239,
      listDate: String(it.f243 ?? ''),
    }));
  },
});
```

---

## 三段解剖

### 1. Declaration — 标头

```javascript
cli({
  site: 'eastmoney',          // 第一级命名空间，目录名一致
  name: 'convertible',        // 第二级，CLI 上的子命令
  description: '...',         // 一句话，出现在 `opencli list` 和 `opencli <site> -h`
  domain: 'push2.eastmoney.com',  // 主要请求域名（诊断面板用）
  strategy: Strategy.PUBLIC,  // PUBLIC / COOKIE / HEADER / INTERCEPT / UI
  browser: false,             // PUBLIC 几乎总是 false；COOKIE/HEADER 一律 true
  ...
});
```

### 2. Args & Columns

```javascript
args: [
  { name: 'sort',  type: 'string', default: 'turnover', help: '...' },
  { name: 'limit', type: 'int',    default: 20,         help: '...' },
],
columns: ['rank', 'bondCode', 'bondName', /* ... */ ],
```

**规则**：

- `type`: `string` / `int` / `float` / `bool`
- `default` 必填（缺失的命令会拒绝启动）
- `columns` 数组必须跟 `func` 返回的 object keys 完全对上，顺序也一致（决定表格列顺序）
- 列名 camelCase，跟 `cli({...})` 其他 adapter 保持统一

### 3. func — 主体

```javascript
func: async (_page, args) => {
  // 1. 解析参数
  const limit = Math.max(1, Math.min(Number(args.limit) || 20, 100));

  // 2. 构造 URL / 请求
  const url = new URL(...);
  url.searchParams.set(...);

  // 3. 发请求
  const resp = await fetch(url, { headers: {...} });
  if (!resp.ok) throw new CliError('HTTP_ERROR', `... HTTP ${resp.status}`);

  // 4. 解析 + 业务校验
  const data = await resp.json();
  const diff = Array.isArray(data?.data?.diff) ? data.data.diff : [];
  if (diff.length === 0) throw new CliError('NO_DATA', '...');

  // 5. map 到 columns 同名 keys
  return diff.slice(0, limit).map((it, i) => ({
    rank: i + 1,
    bondCode: it.f12,
    // ...
  }));
},
```

**参数形态**：

- `page` — 仅当 `browser: true` 时有用；`PUBLIC` 模式传一个 no-op 占位
- `args` — 所有 `args[]` 声明的参数解析后的 object

**错误处理**：

| 场景 | 写法 |
|------|------|
| 参数不合法 | `throw new CliError('INVALID_ARGUMENT', '...')` |
| HTTP 非 2xx | `throw new CliError('HTTP_ERROR', 'HTTP <status>')` |
| 业务返回空 | `throw new CliError('NO_DATA', '...')` 或 `'EMPTY_RESULT'` |
| 需要登录 | `throw new AuthRequiredError(domain)`（从 `@jackwener/opencli/errors` 引） |
| 接口约束失败 | `throw new CliError('API_ERROR', '...')` |

不要 `return []` 了事。autofix skill 靠 CliError 的 code 决定要不要重试。

---

## 同类型 adapter 对照

| 类型 | 代表 | 参考 |
|------|------|-----|
| clist 分页排行 | `convertible.js` / `rank.js` / `etf.js` / `sectors.js` | 都共享 `fs` + `fid` + `po` 结构 |
| ulist 批量报价 | `quote.js` | `secids` 逗号拼接 |
| K 线历史 | `kline.js` | `fields1 / fields2` 控列，CSV 解析 |
| 报表（datacenter-web） | `longhu.js` / `holders.js` | `reportName` 驱动 |
| 7x24 新闻 | `kuaixun.js` | `np-listapi` 栏目 id |
| 公司公告 | `announcement.js` | `np-anotice-stock` |
| 指数/北上 | `index-board.js` / `northbound.js` | push2 专用端点 |

新写一条时，选最像的那类，复制后改 `name` / URL / fields / column 映射三处。

---

## 私人 adapter vs repo 贡献

```
~/.opencli/clis/<site>/<name>.js    # 私人
clis/<site>/<name>.js               # repo 贡献
```

**两者在 `cli({...})` 层面完全一样**。差别只在运行入口：

- 私人：写完立即可跑（`opencli <site> <name>`）
- repo：要 `npm run build` 才被注册

先在 `~/.opencli/clis/` 调通再拷贝到 `clis/`。
