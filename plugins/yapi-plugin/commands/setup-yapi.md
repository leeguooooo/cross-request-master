---
name: setup-yapi
description: Install or verify the YApi CLI and report whether login is required.
---

# Setup YApi

1. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
2. Run `yapi whoami`.
3. If `yapi whoami` reports a login or config problem, tell the user to run `yapi login`.
4. If setup succeeds, summarize that YApi is ready and include the current account if available.
