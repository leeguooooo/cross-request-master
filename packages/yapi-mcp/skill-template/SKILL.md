---
name: yapi
description: Query and sync YApi interface documentation. Use when user mentions "yapi 接口文档", YAPI docs, asks for request/response details, or needs docs sync. Also triggers when user pastes a YApi URL that matches the configured base_url.
---

# YApi interface docs

## Command policy

Prefer `yapi` command. If missing, fallback to one-shot npx without forcing global install:

```bash
yapi -h
# fallback:
npx -y @leeguoo/yapi-mcp -h
```

In command examples below, `yapi` can be replaced by `npx -y @leeguoo/yapi-mcp`.

## Quick workflow
1. If user gives a YApi URL, verify it belongs to configured `base_url`.
2. Confirm auth (`yapi whoami`), then run `yapi login` only when needed.
3. Resolve target by `api_id` / keyword / category.
4. Fetch raw JSON first, then summarize: method, path, headers, params, body, response schema/examples.
5. For docs sync tasks, do `--dry-run` first, then real sync.

## URL detection

1. Read configured `base_url` from `~/.yapi/config.toml`.
```bash
rg -n "^base_url\\s*=" ~/.yapi/config.toml
```
2. If URL origin matches `base_url`, extract IDs from path:
   - `/project/123/...` -> `project_id=123`
   - `.../api/456` -> `api_id=456`
   - `.../api/cat_789` -> `catid=789`
3. Prefer direct lookup when `api_id` exists:
```bash
yapi --path /api/interface/get --query id=<api_id>
```

## Common commands

```bash
# version/help
yapi --version
yapi -h

# auth
yapi whoami
yapi login

# search / fetch
yapi search --q keyword --project-id 310
yapi --path /api/interface/get --query id=123
yapi --path /api/interface/list_cat --query catid=123
```

Config cache locations:
- Config: `~/.yapi/config.toml`
- Auth cache: `~/.yapi-mcp/auth-*.json`

## Docs sync

Binding mode (recommended):
```bash
yapi docs-sync bind add --name projectA --dir docs/release-notes --project-id 267 --catid 3667
yapi docs-sync --binding projectA --dry-run
yapi docs-sync --binding projectA
```

Notes:
- Binding file: `.yapi/docs-sync.json`
- Mapping outputs: `.yapi/docs-sync.links.json`, `.yapi/docs-sync.projects.json`, `.yapi/docs-sync.deployments.json`
- Default behavior syncs changed files only; use `--force` for full sync.
- Compatible with directory `.yapi.json` config as fallback (without binding).
- Mermaid/PlantUML/Graphviz/D2 rendering depends on local tool availability; missing tools do not block basic sync.

## Interface creation guardrails
- Always set `req_body_type` (use `json` if unsure) and provide `res_body` (prefer JSON Schema) when creating/updating interfaces.
- Put structured request/response fields in `req_*` / `res_body`, not only in free-text `desc`/`markdown`.
