# Issue #497 排障记录: weread shelf "Not logged in"

## 问题

用户报告 `opencli weread shelf` 返回 "Not logged in to WeRead",但 Chrome 已登录。

## 根因: extension manifest 缺少 `host_permissions`

### 证据链

1. `opencli doctor` 显示 daemon + extension 均正常连接
2. `page.goto('https://weread.qq.com/')` 后页面显示已登录(有头像、有书架数据)
3. `document.cookie` 能读到 cookie(通过 CDP evaluate 注入)
4. 但 `chrome.cookies.getAll({ url: '...' })` 返回空数组

### 原因

`extension/manifest.json` 声明了 `"cookies"` 权限,但缺少 `host_permissions`。
Manifest V3 要求 `chrome.cookies.getAll()` 的目标域必须在 `host_permissions` 中,否则静默返回空数组。

### 修复

```diff
// extension/manifest.json
  "permissions": [
    "debugger",
    "tabs",
    "cookies",
    "activeTab",
    "alarms"
  ],
+ "host_permissions": [
+   "<all_urls>"
+ ],
```

### 验证

修复前:
```
getCookies({ url: 'https://i.weread.qq.com/...' }) → Count: 0
getCookies({ domain: 'weread.qq.com' }) → Count: 0
getCookies({ url: 'https://weread.qq.com/' }) → Count: 0
```

修复后:
```
getCookies({ url: 'https://i.weread.qq.com/...' }) → Count: 8
  RECENT_CODE | .qq.com
  RK | .qq.com
  ptcz | .qq.com
  wr_fp | .weread.qq.com
  wr_skey | .weread.qq.com
  wr_vid | .weread.qq.com
  wr_ql | .weread.qq.com
  wr_rt | .weread.qq.com
```

## 影响范围

所有通过 `page.getCookies()` 获取 cookie 的适配器都受影响:

| 文件 | 用途 |
|------|------|
| `src/clis/weread/utils.ts:53` | 构造 Cookie header 调用微信读书私有 API |
| `src/clis/bilibili/download.ts:58` | 提取 cookie 给 yt-dlp |
| `src/clis/xiaohongshu/download.ts:103` | 提取 cookie 给下载器 |
| `src/clis/pixiv/download.ts:46` | 提取 cookie 给下载器 |
| `src/clis/twitter/download.ts:98` | 提取 cookie 给下载器 |
| `src/pipeline/steps/download.ts:47,62` | 管道 download 步骤 |

**不受影响**: YAML 管道的 navigate/fetch/evaluate/intercept 步骤(走 CDP,不经过 chrome.cookies API)。

## 后续发现: 私有 API 会话仍可能失效

修复 manifest 后 cookie 能取到了,但私有 API 仍可能返回:
```
HTTP 401 | errcode: -2012 | errmsg: "登录超时"
```

对比无 cookie 时:
```
HTTP 401 | errcode: -2010 | errmsg: "用户不存在"
```

-2012 说明 cookie 已送达,但 Node 侧访问 `i.weread.qq.com` 时会话仍可能失效。
当前代码已把 `HTTP 401` 统一映射为 `AUTH_REQUIRED`,并为 `weread shelf` 增加了一条更稳的回退路径:

1. 先尝试私有 API `/shelf/sync`
2. 若返回 `AUTH_REQUIRED`,再打开 `https://weread.qq.com/web/shelf`
3. 只读取当前会话 `wr_vid` 对应的 `localStorage` 书架缓存
4. 只有确认当前会话缓存存在时才回退成功,否则继续抛原始登录错误

这样区分了两层问题:

- 扩展拿不到 cookie,属于权限配置问题
- 私有 API 会话失效,属于跨执行上下文的认证问题

对于 #497,最终目标是 `weread shelf` 能返回书架数据,而不是强依赖 `/shelf/sync` 在 Node 侧一定可用。

## 当前状态

- worktree 分支: `worktree-fix-cookie-host-perms`
- `extension/manifest.json` 已补 `host_permissions`
- `weread shelf` 已增加基于 `/web/shelf` 结构化缓存的回退逻辑
- 已用活跃会话端到端验证,命令能返回真实书架数据
- 已补回归测试,覆盖权限缺失、当前会话缓存缺失、空书架、以及无排序缓存时的回退行为
