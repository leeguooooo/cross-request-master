# YApi Plugin for Cursor / Claude Code

Cursor 和 Claude Code 插件，用于在编辑器里直接调用本地 `yapi` CLI 的工作流。

> 插件源码位于 [`plugins/yapi-plugin/`](../../plugins/yapi-plugin/)。本页面为插件的说明索引，详细文档见插件目录内 `docs/`。

## 能做什么

- 检测本地是否已安装 `yapi`，缺失时自动 `npm install -g @leeguoo/yapi-mcp`
- 复用 `~/.yapi/config.toml` 与 `yapi login` 的登录状态，不引入第二套认证
- 关键词 / ID / 分类查询接口
- 从编辑器直接跑 `docs-sync`（支持 `--dry-run` 预览）
- 命令行参数支持组合查询字符串，如 `--query "catid=4631&limit=50&page=1"`

## 为什么存在这个插件

- 不重复输入 YApi 凭据
- 把 YApi 的发现与 docs-sync 流程留在 Cursor / Claude Code 里
- 给 agent 提供稳定的命令面，避免让它现编 shell
- 先从 `skill + commands + wrapper scripts` 起步，不强推 MCP

## 首次使用

1. 运行 **Setup YApi** 命令
2. 如果 wrapper 报 `NOT_LOGGED_IN`，运行 **Login YApi**
3. 再跑一次 setup 或 **Who Am I** 确认当前账户
4. 进入 search / query / docs-sync 工作流

## 命令清单

| 分组 | 命令 |
|---|---|
| 环境 | Setup YApi、Login YApi、Who Am I |
| 查询 | Search Interface、Get Interface By ID、List Category Interfaces |
| 同步 | Bind Docs Sync、Run Docs Sync |

## 运行时假设

- 本地已安装 `node` 与 `npm`
- 允许全局 `npm install -g`
- YApi 认证仍由 `yapi login` 管

## 更多文档

- [使用说明](../../plugins/yapi-plugin/docs/usage.md)
- [开发说明](../../plugins/yapi-plugin/docs/development.md)
- [如何接入 marketplace](../../plugins/yapi-plugin/docs/add-a-plugin.md)
- [marketplace 提交清单](../../plugins/yapi-plugin/docs/marketplace-submission.md)
