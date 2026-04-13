---
name: get-interface-by-id
description: Fetch a YApi interface by numeric ID.
---

# Get Interface By ID

1. Ask for the interface ID if it is not already present.
2. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
3. Run `yapi --path /api/interface/get --query id=<api_id>`.
4. Parse the returned payload.
5. Summarize the interface method, path, params, body schema, and response schema.
