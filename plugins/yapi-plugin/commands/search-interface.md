---
name: search-interface
description: Search YApi interfaces by keyword through the local yapi CLI.
---

# Search Interface

1. Ask for the search keyword if it is not already present in the conversation.
2. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
3. Run `yapi search --q <keyword>`.
4. Parse the returned JSON or CLI output.
5. Summarize the most relevant matching interfaces and include IDs when available.
