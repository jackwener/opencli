# 今日头条发文命令（Browser Bridge UI 自动化）设计

**Goal:** 在 `opencli` 中新增 `opencli toutiao publish` 命令，用 Browser Bridge 复用 Chrome 登录态，在今日头条创作者中心页面自动化发布文章。

**Architecture:** 采用“页面 UI 自动化”方案：导航到发文页 → 填写标题/正文 →（可选）上传图片/封面 → 点击发布。参考现有的 `opencli xiaohongshu publish`（同为创作者中心 UI 自动化）实现。

**Tech Stack:** Node.js/TypeScript、opencli Browser Bridge（`IPage`）、命令注册（`registry.ts`）、输出格式化（`-f json/yaml/table`）。

---

## 背景与范围

- **范围（MVP）**
  - 新增命令：`opencli toutiao publish`
  - 支持：标题、正文、发布/草稿开关（默认发布）
  - 可靠失败：未登录、找不到关键控件、发布按钮不可点击、超时等要给出可操作提示

- **不在 MVP（可后续迭代）**
  - 复杂富文本编辑（Markdown/HTML 转换）
  - 自动选频道/合集/声明/原创、定时发布
  - 深度解析发布结果页拿到稳定 `url/id`（若 UI 可读取则返回，否则留空）

## 命令与参数

### 命令

```bash
opencli toutiao publish --title "标题" "正文内容"
```

### 参数（拟定）

- `--title <string>`：必填，文章标题
- `<body>`：必填，正文（位置参数，支持换行）
- `--publish` / `--draft`：互斥，默认 `--publish`
- `--images <paths>`：可选，插图文件路径（逗号分隔）。例如：`--images ./a.jpg,./b.png`
- `--cover <path>`：可选，封面文件路径（若 UI 支持独立封面入口，做；否则先忽略或复用 images）
- `--tags <a,b,c>`：可选，话题/标签（若 UI 有输入）
- `--timeout <sec>`：可选，覆盖命令执行超时（沿用 opencli 的超时/错误模型）

## 行为流程（MVP）

1. **连接浏览器会话**
   - 依赖 Browser Bridge（daemon + Chrome 扩展已连接）
   - 若无法连接，复用现有 `BrowserConnectError` 的诊断输出

2. **导航到发文页**
   - 打开今日头条创作者中心的“发文章”页面（具体 URL 待在实现时确认/抽成常量）
   - `waitUntil: 'load'` + 适当 `wait`

3. **校验登录态**
   - 若页面跳到登录页/出现登录按钮或提示，则抛出 `AuthRequiredError('toutiao.com', ...)`

4. **填写标题/正文**
   - 通过一组“选择器候选列表”查找可见输入框（`input/textarea/contenteditable`）
   - 使用与 `xiaohongshu publish` 类似的“强制填充”逻辑（focus → 清空 → insertText → dispatch input/change）

5. **上传图片（可选）**
   - 优先使用 `page.setFileInput`（CDP `DOM.setFileInputFiles`）上传，失败回退到 base64 DataTransfer 注入
   - 限制图片格式与数量（与仓库现有策略保持一致）

6. **点击发布**
   - 查找“发布”按钮（多 selector + 文本包含）
   - 点击后等待发布成功的 UI 信号（toast、跳转、列表出现新稿件等，具体在实现中确定）

## 输出（结构化）

返回对象（可 `-f json/yaml/table`）：

- `ok: boolean`
- `mode: 'publish' | 'draft'`
- `title: string`
- `url?: string`（能从 UI 读到则填；否则为空/不返回）
- `id?: string`（同上）

## 错误处理与提示

- **未登录**：提示先在 Chrome 登录 `toutiao.com`/创作者中心
- **控件缺失**：提示“页面结构更新/选择器未命中”，建议升级 opencli 或进入 verbose 模式定位
- **上传失败**：提示扩展版本不足（不支持 setFileInput）或页面无 file input
- **超时**：建议提高 `OPENCLI_BROWSER_COMMAND_TIMEOUT` 或 `--timeout`

## 测试策略（建议）

- 单测：选择器/填充逻辑的“纯函数”部分（如果抽出）
- E2E（可选/可跳过）：跟现有 `tests/e2e/browser-*.test.ts` 一样，在 bridge 不可用时自动 skip

