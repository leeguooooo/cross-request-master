---
name: yapi
description: Query and sync YApi interface documentation. Use when user mentions "yapi 接口文档", YAPI docs, asks for request/response details, or needs docs sync. Also triggers when user pastes a YApi URL that matches the configured base_url.
---

# YApi interface docs

## URL Detection

When user provides a URL, check if it matches the configured YApi instance:

1. Read config to get base_url:
```bash
cat ~/.yapi/config.toml | grep base_url
```

2. If the URL's origin matches `base_url`, use yapi CLI to operate:
   - Extract `project_id` from URL path (e.g., `/project/123/...` → project_id=123)
   - Extract `api_id` from URL path (e.g., `.../api/456` → api_id=456)
   - Use `yapi --path /api/interface/get --query id=<api_id>` to fetch details

3. Example URL patterns:
   - `https://yapi.example.com/project/123/interface/api/456` → project=123, api=456
   - `https://yapi.example.com/project/123/interface/api/cat_789` → project=123, category=789

## Prerequisites

### Check if yapi CLI is installed
```bash
yapi --version
```

### If not installed, ask user to install globally
```bash
npm install -g @leeguoo/yapi-mcp
# or
pnpm add -g @leeguoo/yapi-mcp
```

### Check login status
```bash
yapi whoami
```

### If not logged in, login interactively
```bash
yapi login
```
This will prompt for:
- YApi base URL (e.g., https://yapi.example.com)
- Email
- Password

Config is saved to `~/.yapi/config.toml`.

## Workflow
1. If user provides a YApi URL, check if it matches configured `base_url` in `~/.yapi/config.toml`.
2. Ensure yapi CLI is installed (prompt user to install globally if missing).
3. Check login status with `yapi whoami`; if not logged in, run `yapi login`.
4. Load config from `~/.yapi/config.toml` (base_url, auth_mode, email/password or token, optional project_id).
5. Identify the target interface by id, URL, or keyword; ask for project/category ids if needed.
6. Call YApi endpoints with the CLI (see examples below) to fetch raw JSON.
7. Summarize method, path, headers, query/body schema, response schema, and examples.

## CLI Usage
- Config location: `~/.yapi/config.toml`
- Auth cache: `~/.yapi-mcp/auth-*.json`

### Common commands
```bash
# Check version
yapi --version

# Show help
yapi -h

# Check current user
yapi whoami

# Login (interactive)
yapi login

# Search interfaces
yapi search --q keyword

# Get interface by ID
yapi --path /api/interface/get --query id=123

# List interfaces in category
yapi --path /api/interface/list_cat --query catid=123
```

## Docs sync
- Bind local docs to YApi category with `yapi docs-sync bind add --name <binding> --dir <path> --project-id <id> --catid <id>` (stored in `.yapi/docs-sync.json`).
- Sync with `yapi docs-sync --binding <binding>` or run all bindings with `yapi docs-sync`.
- Default syncs only changed files; use `--force` to sync everything.
- Mermaid rendering depends on `mmdc` (auto-installed if possible; failures do not block sync).
- For full Markdown render, install `pandoc` (manual install required).
- Extra mappings (generated after docs-sync run in binding mode):
  - `.yapi/docs-sync.links.json`: local docs to YApi doc URLs.
  - `.yapi/docs-sync.projects.json`: cached project metadata/envs.
  - `.yapi/docs-sync.deployments.json`: local docs to deployed URLs.

## Interface creation tips
- When adding interfaces, always set `req_body_type` (use `json` if unsure) and provide `res_body` (prefer JSON Schema). Empty values can make `/api/interface/add` fail.
- Keep request/response structures in `req_*` / `res_body` instead of stuffing them into `desc` or `markdown`.
