# 豆包 (Doubao) CLI 适配器

通过 Chrome DevTools Protocol (CDP) 控制豆包 AI 桌面应用。

## 前置条件

1. 启动豆包并开启远程调试端口：

```bash
"/Applications/Doubao.app/Contents/MacOS/Doubao" --remote-debugging-port=9226
```

2. 设置环境变量：

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9226"
export OPENCLI_CDP_TARGET="doubao-chat"
```

## 命令

| 命令 | 说明 |
|------|------|
| `opencli doubao status` | 检查 CDP 连接状态 |
| `opencli doubao send "消息"` | 发送消息到豆包 |
| `opencli doubao read` | 读取当前聊天历史 |
| `opencli doubao new` | 开始新对话 |
| `opencli doubao ask "问题"` | 发送消息并等待 AI 回复 |
| `opencli doubao screenshot` | 截图保存到 /tmp/doubao-screenshot.png |
| `opencli doubao dump` | 导出 DOM 到 /tmp/doubao-dom.html |

## 示例

```bash
# 检查连接
opencli doubao status

# 发送消息
opencli doubao send "今天天气怎么样？"

# 提问并等待回复（默认超时30秒）
opencli doubao ask "用一句话介绍北京"

# 读取对话历史
opencli doubao read

# 开始新对话
opencli doubao new
```

## 注意事项

- 豆包必须使用 `--remote-debugging-port=9226` 参数启动
- 如果有多个目标，使用 `OPENCLI_CDP_TARGET=doubao-chat` 指定主聊天窗口