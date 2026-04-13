---
name: whoami-yapi
description: Show the current YApi login identity from the local yapi CLI.
---

# Who Am I

1. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
2. Run `yapi whoami`.
3. If successful, summarize the current YApi identity.
4. If the command indicates missing login, tell the user to run `yapi login`.
