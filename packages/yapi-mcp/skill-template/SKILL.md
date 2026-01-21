---
name: yapi
description: Query and sync YApi interface documentation. Use when user mentions "yapi 接口文档", YAPI docs, asks for request/response details, or needs docs sync.
---

# YApi interface docs

## Workflow
1. Load config from `~/.yapi/config.toml` (base_url, auth_mode, email/password or token, optional project_id).
2. Identify the target interface by id or keyword; ask for project/category ids if needed.
3. Call YApi endpoints with the CLI (see examples below) to fetch raw JSON.
4. Summarize method, path, headers, query/body schema, response schema, and examples.

## CLI
- Install & run: `npx -y @leeguoo/yapi-mcp yapi -h` (or install globally and use `yapi`).
- Use the same config as the skill: `~/.yapi/config.toml`.
- Examples:
  - `yapi --path /api/interface/get --query id=123`
  - `yapi search --q keyword`
  - `yapi whoami`

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
