# YApi Plugin Design

**Date:** 2026-03-26
**Target Repo:** `yapi-plugin`
**Goal:** Create a single-plugin Cursor Marketplace repository that lets users install and use existing YApi CLI capabilities from Cursor with minimal setup.

## Summary

The plugin will reuse the existing `yapi` CLI and its persisted login/config state in `~/.yapi/config.toml`. The plugin itself will not introduce a new authentication model or a separate YApi client implementation.

The first version will ship as a single-plugin Cursor repository based on the official `cursor/plugin-template` single-plugin layout. It will provide:

- A YApi skill adapted for Cursor
- User-invokable commands for setup, login, query, and docs sync flows
- Local wrapper scripts that detect the CLI, auto-install it with `npm` when missing, and normalize command execution/output

## User Experience

### First use

1. User installs the plugin from the Cursor marketplace.
2. When the plugin needs YApi, it checks whether `yapi` is available on `PATH`.
3. If `yapi` is missing, the plugin attempts `npm install -g @leeguoo/yapi-mcp`.
4. After installation, the plugin re-checks availability.
5. The plugin then checks login state with `yapi whoami`.
6. If the user is not logged in, the plugin instructs them to run the login command.

### Steady state

Once `yapi` is installed and logged in, Cursor can use the skill and commands to execute common YApi tasks without additional setup.

## Scope

### In scope for v1

- Single-plugin Cursor repository named `yapi-plugin`
- Reuse local `yapi` CLI and `~/.yapi/config.toml`
- Automatic install of missing CLI via `npm`
- Login assistance via `yapi login`
- Query and sync commands for the highest-value workflows
- Documentation for installation requirements and first-run behavior

### Out of scope for v1

- Reimplementing YApi as a native JS SDK inside the plugin
- A separate plugin-side auth/config UI
- MCP server integration
- Product-specific abstractions beyond the existing CLI surface

## Chosen Architecture

The plugin will use `skill + commands + wrapper scripts`, without MCP.

### Why this architecture

- It matches the current project reality: the core behavior already exists in the `yapi` CLI.
- It keeps the first version small and publishable.
- It avoids adding an extra protocol layer before the plugin proves its value.
- It still gives enough structure to centralize environment checks, installation, and error handling.

## Repository Layout

The repository will follow Cursor's single-plugin guidance rather than the template's default multi-plugin structure.

```text
yapi-plugin/
  .cursor-plugin/
    plugin.json
  assets/
    logo.svg
  commands/
    setup-yapi.md
    login-yapi.md
    whoami-yapi.md
    search-interface.md
    get-interface-by-id.md
    list-category-interfaces.md
    bind-docs-sync.md
    run-docs-sync.md
  docs/
    development.md
    usage.md
  scripts/
    ensure-yapi.mjs
    run-yapi.mjs
    setup-yapi.mjs
  skills/
    yapi/
      SKILL.md
  README.md
  package.json
```

## Responsibilities

### `.cursor-plugin/plugin.json`

- Declare plugin metadata required by Cursor Marketplace
- Point to the plugin logo and packaged assets
- Keep naming aligned with Cursor requirements: lowercase kebab-case `name`

### `skills/yapi/SKILL.md`

- Teach Cursor when the plugin applies
- Explain URL detection rules and common YApi workflows
- Prefer the plugin's wrapper-backed commands over raw shell usage
- Document fallback behavior when CLI/config/login state is missing

### `commands/*`

Each command will be narrow and task-specific so users and Cursor can invoke them explicitly.

Planned command set:

- `Setup YApi`
- `Login YApi`
- `Who Am I`
- `Search Interface`
- `Get Interface By ID`
- `List Category Interfaces`
- `Bind Docs Sync`
- `Run Docs Sync`

### `scripts/ensure-yapi.mjs`

Central environment guard:

- Detect Node/npm availability
- Detect whether `yapi` exists
- Install `@leeguoo/yapi-mcp` globally when missing
- Re-check that installation succeeded
- Report structured status to callers

### `scripts/run-yapi.mjs`

Central command executor:

- Run the requested `yapi` subcommand
- Normalize stdout/stderr
- Map common failures to stable error categories
- Keep all shell/process logic out of command markdown files

### `scripts/setup-yapi.mjs`

High-level bootstrap entrypoint:

- Call `ensure-yapi`
- Check login state with `yapi whoami`
- Return actionable next steps

## Functional Capabilities

### Query workflows

The plugin will support:

- `yapi whoami`
- `yapi search --q <keyword>`
- `yapi --path /api/interface/get --query id=<id>`
- `yapi --path /api/interface/list_cat --query catid=<catid>`

### Login workflow

The plugin will not replace `yapi login`. Instead it will:

- Detect missing login state
- Prompt the user to run the plugin login command
- Delegate to `yapi login`

### Docs sync workflows

The plugin will support:

- `yapi docs-sync bind add ...`
- `yapi docs-sync`

It will document prerequisites and expected local files such as `.yapi/docs-sync.json`.

## Error Handling

The wrapper scripts will normalize failures into a small set of categories:

- `NODE_MISSING`
- `NPM_MISSING`
- `CLI_MISSING`
- `CLI_INSTALL_FAILED`
- `NOT_LOGGED_IN`
- `CONFIG_MISSING`
- `COMMAND_FAILED`

Each error response should include:

- A short machine-stable code
- A human-readable explanation
- The next action the user should take

## Installation Assumptions

The plugin assumes:

- `node` is available locally
- `npm` is available locally
- The environment permits global `npm install -g`

If any prerequisite is missing, the plugin should fail fast with an explicit message rather than attempting undefined fallback behavior.

## Testing Strategy

### Manual validation

- Fresh machine scenario: `yapi` absent, plugin auto-installs it successfully
- Installed but logged-out scenario: login prompt appears with clear next action
- Logged-in scenario: query commands work against existing config
- Docs sync commands execute and surface errors clearly

### Repository validation

- Cursor template validation script passes
- Plugin metadata is complete
- All command and skill frontmatter satisfies Cursor template expectations

## Risks

### Global install permissions

`npm install -g` may fail because of local permissions, Node version issues, or user environment policy. This is acceptable for v1 as long as the error message is explicit and recoverable.

### CLI output drift

If the upstream `yapi` CLI changes message shapes, wrapper parsing may become brittle. The wrapper should minimize reliance on fragile text matching and prefer exit-code-plus-output passthrough where possible.

### Cursor command ergonomics

If Cursor command metadata is too thin, users may not discover the right flows. The README and command descriptions need to be explicit.

## Open Decisions Resolved

- Use Cursor official template as the base: yes
- Use single-plugin repository: yes
- Reuse existing `~/.yapi/config.toml`: yes
- Auto-install missing CLI with npm: yes
- Use MCP in v1: no
- Include login, query, and docs-sync workflows in v1: yes

## Implementation Direction

Implementation should start by creating the `yapi-plugin` repository from the Cursor template, converting it to the single-plugin layout, then replacing starter assets with the YApi plugin manifest, skill, commands, and wrapper scripts.
