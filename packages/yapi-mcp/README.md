# Yapi Auto MCP Server

一个用于 YApi 的 Model Context Protocol (MCP) 服务器，让你能够在 Cursor 等 AI 编程工具中直接操作 YApi 接口文档。

## 项目简介

Yapi Auto MCP Server 是一个基于 [Model Context Protocol](https://modelcontextprotocol.io/) 的服务器，专为 YApi 接口管理平台设计。它允许你在 Cursor、Claude Desktop 等支持 MCP 的 AI 工具中直接：

- 🔍 **搜索和查看** YApi 项目中的接口文档
- ✏️ **创建和更新** 接口定义
- 📋 **管理项目和分类** 结构
- 🔗 **无缝集成** AI 编程工作流
- 🛠 **支持多个 YApi Project配置**

通过 MCP 协议，AI 助手可以理解你的 YApi 接口结构，在编程过程中提供更准确的建议和代码生成。

## 主要功能

### 🔍 接口查询和搜索

- **yapi_search_apis**: 按名称、路径、标签等条件搜索接口
- **yapi_get_api_desc**: 获取特定接口的详细信息（请求/响应结构、参数等）
- **yapi_interface_get**: 获取接口原始数据（对应 `/api/interface/get`）
- **yapi_interface_list**: 获取接口列表（对应 `/api/interface/list`）
- **yapi_interface_list_cat**: 获取分类下接口列表（对应 `/api/interface/list_cat`）
- **yapi_interface_list_menu**: 获取接口菜单列表（对应 `/api/interface/list_menu`）
- **yapi_list_projects**: 列出所有可访问的项目
- **yapi_project_get**: 获取项目详情（对应 `/api/project/get`）
- **yapi_get_categories**: 获取项目下的接口分类和接口列表（支持只返回分类/或包含接口列表）
- **yapi_interface_get_cat_menu**: 获取分类菜单（对应 `/api/interface/getCatMenu`）
- **yapi_update_token**: 全局模式登录并刷新本地登录态 Cookie（可选刷新项目/分类缓存）

### ✏️ 接口管理

- **yapi_save_api**: 创建新接口或更新现有接口
  - 支持完整的接口定义（路径、方法、参数、请求体、响应等）
  - 支持 JSON Schema 和表单数据格式
  - 自动处理接口状态和分类管理
  - 建议把「枚举值/中文备注/示例」优先写在 `req_params` / `req_query` / `req_headers` / `req_body_*` / `res_body`，`desc` 只写一句话简介；更新接口时未提供的字段会尽量保留原值
- **yapi_interface_add**: 新增接口（对应 `/api/interface/add`）
- **yapi_interface_up**: 更新接口（对应 `/api/interface/up`）
- **yapi_interface_save**: 新增或更新接口（对应 `/api/interface/save`）
- **yapi_interface_add_cat**: 新增接口分类（对应 `/api/interface/add_cat`）
- **yapi_open_import_data**: 服务端数据导入（对应 `/api/open/import_data`）

### 🎯 智能特性

- **多项目支持**: 同时管理多个 YApi 项目
- **缓存机制**: 提高查询响应速度
- **详细日志**: 便于调试和监控
- **灵活配置**: 支持环境变量和命令行参数

## 快速开始

### 推荐方式：用 Cross Request Master 一键生成 MCP 配置（免手动找 Token）

如果你日常就在浏览器里使用 YApi，推荐安装 Chrome 扩展 [cross-request-master](https://github.com/leeguooooo/cross-request-master)。它会在 YApi 接口详情页（基本信息区域右上角）提供 **「YApi 工具箱」** 按钮，包含 MCP 配置/Skill 一键安装/CLI docs-sync 说明；另外保留 **「复制给 AI」** 一键复制接口 Markdown：

- MCP 配置（所有项目）：使用 `--yapi-auth-mode=global`（账号密码），启动后调用一次 `yapi_update_token` 刷新登录态 Cookie（并可选刷新项目缓存）
- Skill 一键安装：生成 Codex/Claude Skill，并写入全局配置 `~/.yapi/config.toml`
- CLI 使用与 docs-sync：提供本地 CLI 安装命令和文档同步示例

### Skill 一键安装与 CLI

一条命令把 Skill 安装到 Codex / Claude Code，并写入 `~/.yapi/config.toml`（缺省会提示输入）：

```bash
npx -y @leeguoo/yapi-mcp install-skill \
  --yapi-base-url=https://your-yapi-domain.com \
  --yapi-email=your_email@example.com \
  --yapi-password=your_password
```

CLI 使用示例（走同一份 `~/.yapi/config.toml`）：

```bash
npx -y @leeguoo/yapi-mcp yapi -V
npx -y @leeguoo/yapi-mcp yapi -h
npx -y @leeguoo/yapi-mcp yapi login
npx -y @leeguoo/yapi-mcp yapi --path /api/interface/get --query id=123
```

全局模式下可先执行 `yapi login` 缓存登录态（`~/.yapi-mcp/auth-*.json`），权限失效会自动重新登录。

Markdown 同步到 YApi（支持 Mermaid 预渲染，需 `pandoc` + `mmdc`）：

```bash
npx -y @leeguoo/yapi-mcp yapi docs-sync bind add \
  --name projectA \
  --dir docs/release-notes \
  --project-id 267 \
  --catid 3667

npx -y @leeguoo/yapi-mcp yapi docs-sync --binding projectA
# 或同步 .yapi/docs-sync.json 内的所有绑定
npx -y @leeguoo/yapi-mcp yapi docs-sync
```

说明：
- 绑定配置保存在 `.yapi/docs-sync.json`（自动维护 `files`：文件名 → API id）
- 绑定模式同步后会写入 `.yapi/docs-sync.links.json`（本地文档 → YApi 文档 URL）
- 绑定模式同步后会写入 `.yapi/docs-sync.projects.json`（项目元数据/环境缓存）
- 绑定模式同步后会写入 `.yapi/docs-sync.deployments.json`（本地文档 → 已部署 URL）
- 兼容旧方式：`--dir` 读取目录内 `.yapi.json` 的 `project_id/catid` 与 `source_files`
- 管理绑定：`yapi docs-sync bind list|get|add|update|remove`
- 可用 `--dry-run` 只做转换不更新
- 如需跳过 Mermaid 渲染，使用 `--no-mermaid`

### 手动方式：使用 npx（无需安装）

你可以选择两种模式：

1) **项目 Token 模式**（与 Cross Request Master 的一键配置一致）

```json
{
  "mcpServers": {
    "yapi-auto-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@leeguoo/yapi-mcp",
        "--stdio",
        "--yapi-base-url=https://your-yapi-domain.com",
        "--yapi-token=projectId:your_token_here"
      ]
    }
  }
}
```

2) **全局模式**（只配置一次账号密码，使用登录态 Cookie 调用页面同款接口）

```json
{
  "mcpServers": {
    "yapi-auto-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@leeguoo/yapi-mcp",
        "--stdio",
        "--yapi-base-url=https://your-yapi-domain.com",
        "--yapi-auth-mode=global",
        "--yapi-email=your_email@example.com",
        "--yapi-password=your_password",
        "--yapi-toolset=basic"
      ]
    }
  }
}
```

启动后先在对话里调用一次 `yapi_update_token`，会把登录态 Cookie 缓存到本地 `~/.yapi-mcp/auth-*.json`，并把项目信息缓存到 `~/.yapi-mcp/project-info-*.json`（已尽量使用 `0600` 权限落盘），请不要提交到仓库或分享给他人。

提示：stdio 模式下为了加快 MCP 启动（避免超时），本项目不会在启动阶段做任何“全量缓存预热请求”。如需更快的工具响应，建议先调用一次 `yapi_update_token`。如 MCP 客户端仍提示启动超时，可在客户端配置中提高 `startup_timeout_sec`。

## 安装配置

### 方式一：npx 直接使用（推荐）

无需本地安装，通过 npx 直接运行：

```json
{
  "mcpServers": {
    "yapi-auto-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@leeguoo/yapi-mcp",
        "--stdio",
        "--yapi-base-url=https://yapi.example.com",
        "--yapi-token=projectId:token1,projectId2:token2",
        "--yapi-cache-ttl=10",
        "--yapi-log-level=info"
      ]
    }
  }
}
```

### 方式二：使用环境变量

在 MCP 配置中定义环境变量：

```json
{
  "mcpServers": {
    "yapi-auto-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@leeguoo/yapi-mcp",
        "--stdio"
      ],
      "env": {
        "YAPI_BASE_URL": "https://yapi.example.com",
        "YAPI_TOKEN": "projectId:token1,projectId2:token2",
        "YAPI_AUTH_MODE": "token",
        "YAPI_CACHE_TTL": "10",
        "YAPI_LOG_LEVEL": "info",
        "YAPI_HTTP_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

全局模式对应环境变量（更适合“只配置一次”）：

```json
{
  "mcpServers": {
    "yapi-auto-mcp": {
      "command": "npx",
      "args": ["-y", "@leeguoo/yapi-mcp", "--stdio"],
      "env": {
        "YAPI_BASE_URL": "https://yapi.example.com",
        "YAPI_AUTH_MODE": "global",
        "YAPI_EMAIL": "your_email@example.com",
        "YAPI_PASSWORD": "your_password",
        "YAPI_HTTP_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

### 方式三：本地开发模式

适合需要修改代码或调试的场景：

1. **克隆和安装**：

```bash
git clone <repository-url>
cd yapi-mcp
pnpm install
```

2. **配置环境变量**（在项目根目录创建 `.env` 文件）：

```env
# YApi 基础配置
YAPI_BASE_URL=https://your-yapi-domain.com
YAPI_TOKEN=projectId:your_token_here,projectId2:your_token2_here

# 服务器配置
PORT=3388

# 可选配置
YAPI_CACHE_TTL=10
YAPI_LOG_LEVEL=info
YAPI_HTTP_TIMEOUT_MS=15000
```

3. **启动服务**：

**SSE 模式**（HTTP 服务）：

```bash
pnpm run dev
```

然后在 Cursor 中配置：

```json
{
  "mcpServers": {
    "yapi-mcp": {
      "url": "http://localhost:3388/sse"
    }
  }
}
```

**Stdio 模式**：

```bash
pnpm run build
node dist/cli.js --stdio
```

## 使用指南

### 获取 YApi Token

如果你使用的是 **全局模式**（`--yapi-auth-mode=global` / `YAPI_AUTH_MODE=global`），可以不手动找项目 token：启动后在对话里调用一次 `yapi_update_token`，会自动登录并刷新登录态 Cookie（后续请求会走页面同款接口）。

1. 登录你的 YApi 平台
2. 进入项目设置页面
3. 在 Token 配置中生成或查看 Token

不想手动找 Token 的话，可以用 [cross-request-master](https://github.com/leeguooooo/cross-request-master) 在接口详情页一键生成 **MCP 配置（所有项目）** 或 **Skill 一键安装**。

![Token 获取示例](./images/token.png)

Token 格式说明：

- 单项目：`projectId:token`
- 多项目：`projectId1:token1,projectId2:token2`

### 使用示例

配置完成后，你可以在 Cursor 中这样使用：

![使用示例](./images/demo1.png)

**常用操作示例**：

1. **搜索接口**：

   > "帮我找一下用户登录相关的接口"

2. **查看接口详情**：

   > "显示用户注册接口的详细信息"

3. **创建新接口**：

   > "帮我创建一个获取用户列表的接口，路径是 /api/users，使用 GET 方法"

4. **更新接口**：
   > "更新用户登录接口，添加验证码参数"

## 高级配置

### 命令行参数详解

| 参数               | 描述                          | 示例                                       | 默认值 |
| ------------------ | ----------------------------- | ------------------------------------------ | ------ |
| `--yapi-base-url`  | YApi 服务器基础 URL           | `--yapi-base-url=https://yapi.example.com` | -      |
| `--yapi-token`     | YApi 项目 Token（支持多项目） | `--yapi-token=1026:token1,1027:token2`     | -      |
| `--yapi-auth-mode` | 鉴权模式：`token` 或 `global` | `--yapi-auth-mode=global`                  | token  |
| `--yapi-email`     | 全局模式登录邮箱              | `--yapi-email=a@b.com`                     | -      |
| `--yapi-password`  | 全局模式登录密码              | `--yapi-password=******`                   | -      |
| `--yapi-toolset`   | 工具集：`basic` 或 `full`      | `--yapi-toolset=basic`                     | basic  |
| `--yapi-cache-ttl` | 缓存时效（分钟）              | `--yapi-cache-ttl=10`                      | 10     |
| `--yapi-log-level` | 日志级别                      | `--yapi-log-level=info`                    | info   |
| `--port`           | HTTP 服务端口（SSE 模式）     | `--port=3388`                              | 3388   |
| `--stdio`          | 启用 stdio 模式（MCP 必需）   | `--stdio`                                  | -      |

### 环境变量说明

创建 `.env` 文件进行配置：

```env
# 必需配置
YAPI_BASE_URL=https://your-yapi-domain.com

# 模式一：项目 Token 模式
YAPI_AUTH_MODE=token
YAPI_TOKEN=projectId:your_token_here

# 模式二：全局模式（只配置一次账号密码，启动后调用 yapi_update_token 刷新登录态 Cookie）
# YAPI_AUTH_MODE=global
# YAPI_EMAIL=your_email@example.com
# YAPI_PASSWORD=your_password
# YAPI_TOOLSET=basic

# 可选配置
PORT=3388                    # HTTP 服务端口
YAPI_CACHE_TTL=10           # 缓存时效（分钟）
YAPI_LOG_LEVEL=info         # 日志级别：debug, info, warn, error, none
```

### 日志级别说明

- **debug**: 输出所有日志，包括详细的调试信息
- **info**: 输出信息、警告和错误日志（默认）
- **warn**: 只输出警告和错误日志
- **error**: 只输出错误日志
- **none**: 不输出任何日志

### 配置方式选择建议

| 使用场景 | 推荐方式              | 优势               |
| -------- | --------------------- | ------------------ |
| 日常使用 | npx + 命令行参数      | 无需安装，配置简单 |
| 团队共享 | npx + 环境变量        | 配置统一，易于管理 |
| 开发调试 | 本地安装 + SSE 模式   | 便于调试和修改代码 |
| 企业部署 | 本地安装 + stdio 模式 | 性能更好，更稳定   |
