# Marketplace Submission

## Plugin name

`YApi Plugin`

## Repository

- GitHub: [https://github.com/leeguooooo/yapi-plugin](https://github.com/leeguooooo/yapi-plugin)
- Plugin slug: `/add-plugin yapi-plugin`

## Short description

Use YApi from Cursor through the local yapi CLI. Install it automatically, reuse existing login state, inspect interfaces, and run docs-sync workflows.

## Expanded description

YApi Plugin brings the existing `yapi` CLI into Cursor with a cleaner workflow for both users and agents. It checks whether the local CLI is available, installs `@leeguoo/yapi-mcp` automatically when needed, reuses the existing `~/.yapi/config.toml` login state, and exposes the most common YApi tasks through a dedicated skill and focused commands.

The first release is intentionally narrow: setup, login assistance, interface lookup, category listing, and `docs-sync`. That keeps the plugin easy to understand while covering the highest-value YApi flows developers already use.

## Key workflows

- Verify environment and auto-install the YApi CLI
- Reuse existing `yapi login` state instead of adding a second auth flow
- Search interfaces with keywords
- Fetch interface details by numeric ID
- List interfaces in a YApi category
- Bind and run `docs-sync`

## User requirements

- Local `node`
- Local `npm`
- Permission to run `npm install -g`
- YApi credentials configured through `yapi login`

## Included components

- Skills: 1
- Commands: 8
- MCP: none
- Hooks: none

## Verification summary

- `npm test`
- `npm run validate`

## Notes for submission

- The plugin is a single-plugin repository derived from the official Cursor template
- The current logo is a committed SVG asset at `assets/logo.svg`
- The source repository is public and ready for Cursor review
