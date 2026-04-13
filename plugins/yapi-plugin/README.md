# yapi-plugin

Cursor and Claude Code plugin for YApi workflows.

> 本插件已从独立仓库 [leeguooooo/yapi-plugin](https://github.com/leeguooooo/yapi-plugin) 合并回主仓库 [cross-request-master](https://github.com/leeguooooo/cross-request-master)，当前目录为 `plugins/yapi-plugin/`。独立仓库已归档。

It wraps the existing `yapi` CLI so you can use YApi without leaving the editor. The plugin checks whether `yapi` is installed, installs `@leeguoo/yapi-mcp` automatically when needed, reuses your existing `~/.yapi/config.toml`, and exposes the common query and `docs-sync` flows as Cursor skills and commands.

## What it does

- Detect and install `@leeguoo/yapi-mcp` automatically when `yapi` is missing
- Reuse `~/.yapi/config.toml` and existing `yapi login` state
- Surface CLI update prompts and support `yapi self-update`
- Warn when the installed YApi skill snapshot is older than the current CLI
- Query interfaces by keyword or ID
- List interfaces under a category
- Run `docs-sync` commands from Cursor
- Preview `docs-sync` uploads with `--dry-run` before pushing large Mermaid-heavy docs
- Accept combined query strings such as `--query "catid=4631&limit=50&page=1"`

## Why this plugin

- Avoids re-entering YApi credentials in a second tool
- Keeps YApi discovery and docs-sync flows inside Cursor
- Gives agents a stable command surface instead of ad-hoc shell instructions
- Starts simple with `skill + commands + wrapper scripts`, without forcing MCP on day one

## Layout

- `.cursor-plugin/plugin.json`: marketplace metadata
- `.claude-plugin/plugin.json`: Claude Code plugin metadata
- `skills/yapi/SKILL.md`: YApi routing and URL handling guidance（与仓库顶层 `skills/yapi/SKILL.md` 保持一致）
- `commands/`: setup, login, query, and docs-sync command prompts
- `scripts/`: local Node wrappers around the `yapi` CLI

## Local development

从仓库根目录运行：

```bash
cd plugins/yapi-plugin
npm test             # node --test tests/*.test.mjs
npm run validate     # node scripts/validate-template.mjs
```

## Runtime assumptions

- `node` and `npm` are available locally
- global npm install is permitted
- YApi authentication is still managed by `yapi login`

## Marketplace copy

Short description:

> Use YApi from Cursor / Claude Code through the local yapi CLI. Install it automatically, reuse existing login state, inspect interfaces, and run docs-sync workflows.

Primary workflows:

- Setup YApi and verify login state
- Search interfaces by keyword
- Fetch interface details by ID
- List category interfaces
- Bind and run `docs-sync`
