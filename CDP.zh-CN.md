# 通过 CDP 远程连接 OpenCLI (服务器/无头环境)

如果你无法使用 Playwright MCP Bridge 浏览器扩展（例如：在无界面的远程服务器上运行 OpenCLI 时），OpenCLI 提供了备选方案：通过连接 **CDP (Chrome DevTools Protocol，即 Chrome 开发者工具协议)** 来直接控制本地 Chrome。

出于安全考虑，CDP 默认仅绑定在 `localhost` 的本地端口。所以，若是想让**远程服务器**调用本地的 CDP 服务，我们需要依靠一层额外的网络隧道。

本指南将整个过程拆分为三个阶段：
1. **阶段一：准备工作**（在本地启动允许 CDP 调试的 Chrome）。
2. **阶段二：建立网络隧道**（通过 **SSH反向隧道** 或 **反向代理工具**，将本地的 CDP 端口暴露给服务器）。
3. **阶段三：执行命令**（在服务器端运行 OpenCLI）。

---

## 阶段一：准备工作 (本地电脑)

首先，你需要在你的本地电脑上，通过命令行参数启动一个开启了远程调试端口的 Chrome 实例。

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile" \
  --remote-allow-origins="*"
```

**Linux:**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile" \
  --remote-allow-origins="*"
```

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%USERPROFILE%\chrome-debug-profile" ^
  --remote-allow-origins="*"
```

> **注意**：此处增加的 `--remote-allow-origins="*"` 参数对于较新版本的 Chrome 来说通常是[必需的]，以允许来自反向代理（如 ngrok）的跨域 WebSocket 连接请求。

待这个新的浏览器实例打开后，**手工登录那些你打算使用的网站**（如 bilibili.com、zhihu.com 等），这可以让该浏览器的运行资料（Profile）保留上这些网站登录用的 Cookie。

---

## 阶段二：建立网络隧道

现在你的本地已经有了一个监听在 `9222` 端口的 CDP 服务，接下来，选择以下任意一种方式将其实际暴露给你的远端服务器。

### 方法 A：SSH 反向端口转发 (推荐)

如果你的本地电脑可以直连远程服务器的 SSH，那么这是最简单且最安全的做法。

在你的 **本地电脑** 终端上直接运行这条 ssh 命令，将远程服务器的 `9222` 端口反向映射回本地的 `9222` 端口：

```bash
ssh -R 9222:localhost:9222 your-server-user@your-server-ip
```

保持此 SSH 会话在后台运行即可。

### 方法 B：反向代理 / 内网穿透 (ngrok / frp / socat)

如果因为 NAT 或防火墙等因素导致无法直连 SSH 服务器，你可以使用 `ngrok` 等内网穿透工具。

在 **本地电脑** 运行 ngrok 将本地的 `9222` 端口暴露到公网：

```bash
ngrok http 9222
```

此时终端里会打印出一段专属的转发 URL 地址（如：`https://abcdef.ngrok.app`）。**复制这一段 URL 地址备用**。

---

## 阶段三：执行命令 (远程服务器)

现在，所有的准备工作已结束。请切换到你已安装好 OpenCLI 的 **远程服务器** 终端上。

根据你在上方阶段二所选择的隧道方案，在终端中配置对应的 `OPENCLI_CDP_ENDPOINT` 环境变量：

### 若使用 方法 A (SSH 反向隧道)：

```bash
export OPENCLI_CDP_ENDPOINT="http://localhost:9222"
opencli doctor                    # 查看并验证连接是否通畅
opencli bilibili hot --limit 5    # 执行目标命令
```

### 若使用 方法 B (Ngrok 等反向代理)：

```bash
# 将刚刚使用 ngrok 得到的地址填入这里
export OPENCLI_CDP_ENDPOINT="https://abcdef.ngrok.app"
opencli doctor                    # 查看并验证连接是否通畅
opencli bilibili hot --limit 5    # 执行目标命令
```

> *Tip: 如果你填写的是一个普通 HTTP/HTTPS 的 URL 地址，OpenCLI 会自动尝试抓取该地址下的 `/json/version` 节点，来动态解析并连接真正底层依赖的 WebSocket 地址。*

如果你想在此服务器上永久启用该配置，可以将对应的 `export` 语句追加进入你的 `~/.bashrc` 或 `~/.zshrc` 配置文件中。
