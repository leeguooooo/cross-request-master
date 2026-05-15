---
name: yapi
description: Query and sync YApi interface documentation. Use when user mentions "yapi 接口文档", YAPI docs, asks for request/response details, or needs docs sync. Also triggers when user pastes a YApi URL that matches the configured base_url.
---

# YApi interface docs

## Install / update

Preferred install / refresh flow:

```bash
npx skills add leeguooooo/cross-request-master -y -g
```

Preferred config bootstrap after skill install:

```bash
yapi config init --base-url=https://your-yapi-domain.com --auth-mode=global --email=YOUR_EMAIL
yapi login --base-url=https://your-yapi-domain.com --browser
```

Compatibility path when the user also wants to write `~/.yapi/config.toml` in one step:

```bash
npm install -g @leeguoo/yapi-mcp
yapi install-skill --yapi-base-url=https://your-yapi-domain.com --yapi-auth-mode=global --yapi-email=YOUR_EMAIL --force
```

## Command policy

Always use the real `yapi` CLI directly; **do not call plugin-local `node scripts/...` files from the user's project**. Inside Cursor or Claude Code, commands run from the user's workspace, so relative plugin paths are unreliable.

Prefer `yapi` command. If missing, fallback to one-shot npx without forcing global install:

```bash
yapi -h
# fallback:
npx -y -p @leeguoo/yapi-mcp yapi -h
```

In command examples below, `yapi` can be replaced by `npx -y -p @leeguoo/yapi-mcp yapi`.
When CLI version is newer than the installed skill snapshot, `yapi` warns and asks to rerun:

```bash
npx skills add leeguooooo/cross-request-master -y -g
# compatibility:
npx -y -p @leeguoo/yapi-mcp yapi install-skill --force
```

## Setup / auth bootstrap

1. Read configured `base_url` from `~/.yapi/config.toml` when available.
2. If config is missing, prefer browser login bootstrap:
```bash
yapi login --base-url https://your-yapi-domain.com --browser
# optional explicit page:
yapi login --base-url https://your-yapi-domain.com --login-url https://your-yapi-domain.com/
```
3. If the user provides email/password, global auth also works:
```bash
yapi login --base-url https://your-yapi-domain.com --email you@example.com --password '***'
```
4. Validate login before deeper operations:
```bash
yapi whoami
```

## Quick workflow
1. **Classify the user input first** — do not pick a strategy until you know which it is:
   - **A. YApi page URL** (`https://yapi.example.com/project/123/api/456`) → extract IDs from path → `yapi interface get --id 456`. Skip search.
   - **B. HTTP endpoint path** (`/api/auth/token`, `/v1/users/:id`) → see `## Find interface by HTTP path` below. **`yapi search` does not index paths**, do not use it for this case.
   - **C. Product keyword** (`语音房列表`, `voice room`) → `yapi search` with keyword expansion (see `## Keyword expansion`).
   - **D. Numeric `api_id`** → `yapi interface get --id <api_id>` directly.
2. Confirm auth (`yapi whoami`), then run `yapi login --browser` when needed (open base URL, finish login in browser, then press Enter to sync cookie).
3. Fetch raw JSON first, then summarize: method, path, headers, params, body, response schema/examples.
4. For docs sync tasks, do `--dry-run` first, then real sync.
5. If docs sync still hits `413`, note that CLI already retries the file with `--mermaid-classic`; if it still fails, split the doc or reduce embedded diagrams.

## Find interface by HTTP path

When the user gives an HTTP endpoint path like `/api/auth/token` (not a YApi page URL), `yapi search` will return empty because YApi's project search **does not index interface paths**. Use `yapi interface list-menu` with the built-in `--path` filter instead — the CLI does the filtering, no shell pipes needed.

**Required input**: project ID. If the user did not provide one, ask first or list candidates (`yapi project list --group-id <id>`); do not start enumerating projects/groups speculatively.

```bash
# substring match, case-insensitive (matches /api/auth/token, /api/auth/token/refresh, etc.)
yapi interface list-menu --project-id 365 --path /api/auth/token

# narrow further by HTTP method (case-insensitive exact match)
yapi interface list-menu --project-id 365 --path /api/auth/token --method POST

# combine to find all POST endpoints under a prefix
yapi interface list-menu --project-id 365 --path /api/auth --method POST
```

The filtered response shape is:
```json
{
  "errcode": 0,
  "data": {
    "matches": [
      { "project_id": 365, "catid": 100, "cat_name": "Auth",
        "_id": 31400, "title": "Get Token", "path": "/api/auth/token", "method": "POST" }
    ],
    "total": 1
  }
}
```

After locating the `_id`, fetch full details:
```bash
yapi interface get --id 31400
```

**Anti-patterns — do not do these**:
- ❌ `yapi search --q '/api/auth/token'` (project search does not index paths; will return empty)
- ❌ `yapi interface list --project-id X --limit all | python ...` (slow, brittle, blocked by most security gates)
- ❌ Enumerating groups → projects → repeated `search` to guess where the path lives. Ask the user for the project instead.

## Keyword expansion

Do not stop after one failed `yapi search`.

When the user asks with fuzzy product wording such as "语音房列表", "房间列表", "房间详情", "推荐房间", "语音房", "直播间", or similar:

1. Search the original phrase first.
2. If there is no direct hit, immediately retry 3-6 closely related variants before asking the user for more detail.
3. Prefer Chinese variants, English variants, and endpoint-style nouns.
4. If there are still no interface hits, search likely related nouns/categories separately before giving up.

Suggested expansions for room-style queries:

- `语音房列表`
- `房间列表`
- `语音房`
- `房间详情`
- `房间推荐`
- `room list`
- `room detail`
- `voice room`

Example:

```bash
yapi search --q "语音房列表"
yapi search --q "房间列表"
yapi search --q "语音房"
yapi search --q "房间详情"
yapi search --q "room list"
yapi search --q "voice room"
```

Only ask the user for project name / extra keywords after the expanded search pass still returns no useful interface results.

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
yapi self-update
yapi -h

# auth
yapi whoami
yapi login --base-url https://your-yapi-domain.com --browser
yapi login --browser
yapi login --login-url https://your-yapi-domain.com/
yapi logout

# search / fetch
yapi search --q keyword --project-id 310
yapi --path /api/interface/get --query id=123
yapi --path /api/interface/list_cat --query catid=123
yapi --path /api/interface/list_cat --query "catid=4631&limit=50&page=1"

# browse entities
yapi group list
yapi project list --group-id 129 --page 1 --limit 10
yapi project get --id 365
yapi project token --project-id 365
yapi interface list-menu --project-id 365
yapi interface list-menu --project-id 365 --path /api/auth/token
yapi interface list-menu --project-id 365 --path /api/auth --method POST
yapi interface list --project-id 365 --limit all
yapi interface get --id 31400
yapi interface cat add --project-id 365 --name "公共分类" --desc ""
yapi interface cat update --cat-id 3722 --name "公共分类 1" --desc "公共分类"
yapi interface cat delete --cat-id 4169
yapi env --project-id 365
yapi member list --project-id 365
yapi follow
yapi user search --q keyword
yapi log list --type group --type-id 129 --page 1 --limit 10

# exports / test collections
yapi export --project-id 365 --type swagger --name openapi.json
yapi col list --project-id 365
yapi col cases --id 12 --project-id 365
```

Config cache locations:
- Config: `~/.yapi/config.toml`
- Auth cache: `~/.yapi-mcp/auth-*.json`

Browser login dependency:
```bash
agent-browser-stealth -V
# install once if missing browser runtime
agent-browser-stealth install
```

## Docs sync

Binding mode (recommended):
```bash
yapi docs-sync bind add --name projectA --dir docs/release-notes --project-id 267 --catid 3667
yapi docs-sync bind list
yapi docs-sync bind get --name projectA
yapi docs-sync bind update --name projectA --source-file architecture.md
yapi docs-sync --binding projectA --dry-run
yapi docs-sync --binding projectA --source-file architecture.md
yapi docs-sync --binding projectA
```

Notes:
- Binding file: `.yapi/docs-sync.json`
- Mapping outputs: `.yapi/docs-sync.links.json`, `.yapi/docs-sync.projects.json`, `.yapi/docs-sync.deployments.json`
- When bindings live under the global `~/.yapi/docs-sync.json`, relative `--dir` values are resolved from the current git project root and stored as `$HOME`-relative paths.
- Default behavior syncs changed files only; use `--force` for full sync.
- Compatible with directory `.yapi.json` config as fallback (without binding).
- `yapi docs-sync bind remove --name projectA` removes a binding.
- `--source-file` overrides binding `source_files`; `--clear-source-files` clears the stored list on bind update.
- `--dry-run` prints per-file preview lines with Markdown/HTML/payload sizes before upload.
- If upload hits `413 Payload Too Large`, the CLI first retries that file with `--mermaid-classic`, then reports payload size, parsed server limit (when available), and the largest Mermaid block if it still fails.
- Mermaid/PlantUML/Graphviz/D2 rendering depends on local tool availability; missing tools do not block basic sync.

### HTML source files (0.6.1+)

`docs-sync` picks up both `.md` and `.html` in the bound directory. HTML files **skip the rendering pipeline entirely** and are wrapped in an `<iframe srcdoc sandbox="allow-same-origin">` before being written to the YApi `desc` field — this isolates the HTML's global `<style>` rules and heading sizes from YApi's page chrome. The `markdown` field carries a warning banner + fenced HTML source so teammates won't accidentally edit the doc on the YApi web UI (which would clobber `desc`).

- HTML must be self-contained (inline CSS, base64 / CDN images); the CLI does not rewrite relative resource paths.
- HTML content is **not** XSS-sanitized — trust the source. The iframe is `allow-same-origin` only (no `allow-scripts`), so embedded `<script>` tags will not execute.
- iframe height is fixed at `1500px`; overflow scrolls inside the iframe.
- When both `foo.md` and `foo.html` exist in the directory, the CLI uses `.html` and warns; delete the `.md` to silence the warning.
- Watch mode (`--watch`) monitors both `.md` and `.html` changes.
- Hash compatibility: existing `.md` files keep their old hash exactly; upgrading from 0.5.x will not trigger spurious re-pushes.
- **0.6.0 → 0.6.1 upgrade**: 0.6.0 wrote raw HTML into `desc` and polluted the YApi page styles. After upgrading to 0.6.1, run `yapi docs-sync --force` once to overwrite the affected docs with the iframe-wrapped version.

## Interface creation guardrails
- Always set `req_body_type` (use `json` if unsure) and provide `res_body` (prefer JSON Schema) when creating/updating interfaces.
- Put structured request/response fields in `req_*` / `res_body`, not only in free-text `desc`/`markdown`.
