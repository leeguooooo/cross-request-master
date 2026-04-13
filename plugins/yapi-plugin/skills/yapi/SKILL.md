---
name: yapi
description: Query YApi interfaces and run docs-sync workflows through the local yapi CLI. Use when the user mentions YApi, shares a YApi URL, or asks for docs-sync operations.
---

# YApi Skill

Use this skill when the task is clearly about YApi.

## Preferred execution path

Do not call plugin-local `node scripts/...` files from the user's project. In Cursor, commands run from the user's current workspace, so relative plugin paths are unreliable.

Always use the real `yapi` CLI directly:

1. Check whether `yapi` exists with `command -v yapi`.
2. If `yapi` is missing and the user wants setup, install `@leeguoo/yapi-mcp` with `npm install -g @leeguoo/yapi-mcp`.
3. If the CLI reports `skill update available`, rerun `yapi install-skill --force`.
4. Use direct `yapi ...` commands for query and docs-sync operations.
5. Only ask the user to run `yapi login` when `whoami` or another command shows a login/config problem.

## What the plugin assumes

- `node` and `npm` are installed locally
- The plugin may install `@leeguoo/yapi-mcp` globally if `yapi` is missing
- Authentication is reused from `~/.yapi/config.toml`

## Supported workflows

### Setup and login

- Verify YApi CLI availability with `command -v yapi`
- If missing, install with `npm install -g @leeguoo/yapi-mcp`
- Upgrade with `yapi self-update` when the user explicitly wants the latest CLI
- Check login state with `yapi whoami`
- If login is missing, guide the user to run `yapi login`
- Do not invent a second config format; always reuse `~/.yapi/config.toml`

### Query interfaces

- Search interfaces: `yapi search --q <keyword>`
- Query by ID: `yapi --path /api/interface/get --query id=<api_id>`
- List category interfaces: `yapi --path /api/interface/list_cat --query catid=<catid>`
- Combined query string is supported: `yapi --path /api/interface/list_cat --query "catid=4631&limit=50&page=1"`
- Inspect login state: `yapi whoami`

### Docs sync

- Bind docs: `yapi docs-sync bind add --name <binding> --dir <path> --project-id <id> --catid <id>`
- In global `~/.yapi/docs-sync.json` mode, relative `--dir` values are resolved from the current git project root
- Preview first: `yapi docs-sync --binding <binding> --dry-run`
- Run sync: `yapi docs-sync --binding <binding>`

## URL detection

When the user shares a YApi URL:

1. Read `~/.yapi/config.toml` and compare the URL origin with `base_url`
2. If the origin matches, extract:
   - `project_id` from `/project/<id>/...`
   - `api_id` from `/interface/api/<id>`
   - `catid` from `/interface/api/cat_<id>`
3. Use the matching CLI command instead of manual browser steps

## Response expectations

- Summarize method, path, headers, request schema, and response schema when interface data is returned
- If a direct CLI command fails, surface the stderr and suggest the next step
- Do not instruct the model to run plugin-relative files from the current workspace
