---
name: run-docs-sync
description: Run YApi docs-sync for one binding or for all configured bindings.
---

# Run Docs Sync

1. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
2. If a binding name is provided, run `yapi docs-sync --binding <binding>`.
3. Otherwise run `yapi docs-sync`.
4. Parse the response and summarize synced files or any reported failure.
