---
name: login-yapi
description: Prepare the local YApi CLI and then run yapi login using the user's existing config flow.
---

# Login YApi

1. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
2. Run `yapi login`.
3. Tell the user that credentials are stored in `~/.yapi/config.toml`.
4. Recommend running `yapi whoami` after login to confirm the environment.
