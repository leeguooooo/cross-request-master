---
name: list-category-interfaces
description: List YApi interfaces under a category ID.
---

# List Category Interfaces

1. Ask for the category ID if it is not already present.
2. Run `command -v yapi >/dev/null || npm install -g @leeguoo/yapi-mcp`.
3. Run `yapi --path /api/interface/list_cat --query catid=<catid>`.
4. Parse the response.
5. Return the interface list with IDs and paths when available.
