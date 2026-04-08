# YApi Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-plugin Cursor Marketplace repository named `yapi-plugin` that wraps the existing `yapi` CLI with setup, login, query, and docs-sync workflows.

**Architecture:** Start from Cursor's official plugin template, convert it to a single-plugin repository, and replace starter assets with a `skill + commands + wrapper scripts` implementation. Wrapper scripts own CLI detection, auto-install, and execution so the skill and commands stay declarative.

**Tech Stack:** Cursor plugin manifest, Markdown skills/commands, Node.js scripts, npm global installation, GitHub template repo.

---

### Task 1: Create The Repository Skeleton

**Files:**
- Create: `/Users/leo/github.com/yapi-plugin/*`
- Modify: `/Users/leo/github.com/yapi-plugin/.cursor-plugin/plugin.json`
- Test: `node scripts/validate-template.mjs`

- [ ] **Step 1: Create the target repository from Cursor's template**

Run: `gh repo create yapi-plugin --public --template cursor/plugin-template --clone`
Expected: a new local repository exists at `/Users/leo/github.com/yapi-plugin`

- [ ] **Step 2: Convert the template to single-plugin layout**

Keep one root `.cursor-plugin/plugin.json`, move the selected starter plugin contents to repo root, and remove multi-plugin-only files such as root `.cursor-plugin/marketplace.json` and unused starter plugin folders.

- [ ] **Step 3: Verify the repository is on a non-main branch before implementation**

Run: `git checkout -b codex/init-yapi-plugin`
Expected: `git branch --show-current` prints `codex/init-yapi-plugin`

- [ ] **Step 4: Run template validation once after restructuring**

Run: `node scripts/validate-template.mjs`
Expected: either success or a focused list of template issues to fix next

### Task 2: Define Plugin Metadata And Package Layout

**Files:**
- Modify: `/Users/leo/github.com/yapi-plugin/.cursor-plugin/plugin.json`
- Create: `/Users/leo/github.com/yapi-plugin/package.json`
- Create: `/Users/leo/github.com/yapi-plugin/assets/logo.svg`
- Modify: `/Users/leo/github.com/yapi-plugin/README.md`

- [ ] **Step 1: Write or update plugin manifest metadata**

Set plugin `name`, `displayName`, `description`, `author`, `keywords`, `license`, `version`, and `logo` to real `yapi-plugin` values.

- [ ] **Step 2: Add package metadata for local scripts**

Create a minimal `package.json` that supports running validation and local node-based wrapper scripts without introducing unnecessary runtime dependencies.

- [ ] **Step 3: Replace placeholder branding**

Add a simple committed logo asset and update the README headline/summary to describe the actual YApi plugin.

- [ ] **Step 4: Re-run template validation**

Run: `node scripts/validate-template.mjs`
Expected: metadata-specific failures are cleared

### Task 3: Add Wrapper Scripts With TDD

**Files:**
- Create: `/Users/leo/github.com/yapi-plugin/scripts/ensure-yapi.mjs`
- Create: `/Users/leo/github.com/yapi-plugin/scripts/run-yapi.mjs`
- Create: `/Users/leo/github.com/yapi-plugin/scripts/setup-yapi.mjs`
- Create: `/Users/leo/github.com/yapi-plugin/tests/ensure-yapi.test.mjs`
- Create: `/Users/leo/github.com/yapi-plugin/tests/run-yapi.test.mjs`

- [ ] **Step 1: Write a failing test for CLI detection/install decision logic**

Cover:
- missing `yapi` binary
- missing `npm`
- install success path
- install failure path

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `node --test tests/ensure-yapi.test.mjs`
Expected: failing assertions because `ensure-yapi.mjs` does not exist yet

- [ ] **Step 3: Implement minimal `ensure-yapi.mjs`**

Use `child_process` helpers to:
- detect `node`, `npm`, and `yapi`
- install `@leeguoo/yapi-mcp` via `npm install -g` when needed
- emit structured JSON results

- [ ] **Step 4: Re-run the targeted detection test to verify GREEN**

Run: `node --test tests/ensure-yapi.test.mjs`
Expected: pass

- [ ] **Step 5: Write a failing test for command execution and error normalization**

Cover:
- successful `yapi whoami`
- non-zero exit mapped to `COMMAND_FAILED`
- login-related failure mapped to `NOT_LOGGED_IN` when identifiable

- [ ] **Step 6: Run the targeted command test to verify RED**

Run: `node --test tests/run-yapi.test.mjs`
Expected: fail before implementation exists

- [ ] **Step 7: Implement minimal `run-yapi.mjs` and `setup-yapi.mjs`**

`run-yapi.mjs` should run `yapi` subcommands after `ensure-yapi`.
`setup-yapi.mjs` should compose setup + `yapi whoami` checks and emit next-step guidance.

- [ ] **Step 8: Re-run the targeted wrapper test to verify GREEN**

Run: `node --test tests/run-yapi.test.mjs`
Expected: pass

### Task 4: Add Cursor Skill And Commands

**Files:**
- Create: `/Users/leo/github.com/yapi-plugin/skills/yapi/SKILL.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/setup-yapi.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/login-yapi.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/whoami-yapi.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/search-interface.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/get-interface-by-id.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/list-category-interfaces.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/bind-docs-sync.md`
- Create: `/Users/leo/github.com/yapi-plugin/commands/run-docs-sync.md`

- [ ] **Step 1: Write the YApi skill for Cursor**

Port only the relevant behavior from the current Codex skill:
- detect YApi URLs
- prefer the plugin's wrapper-backed commands
- explain config/login prerequisites
- describe supported query and docs-sync flows

- [ ] **Step 2: Add setup and login commands**

Commands should call the wrapper scripts rather than embedding shell logic inline.

- [ ] **Step 3: Add query commands**

Support whoami, search, interface get, and category listing via consistent script entrypoints.

- [ ] **Step 4: Add docs-sync commands**

Support `docs-sync bind add` and `docs-sync` with clear parameter expectations and error messages.

- [ ] **Step 5: Run template validation**

Run: `node scripts/validate-template.mjs`
Expected: all command/skill frontmatter and structure are valid

### Task 5: Document Usage And Verify End-To-End

**Files:**
- Modify: `/Users/leo/github.com/yapi-plugin/README.md`
- Create: `/Users/leo/github.com/yapi-plugin/docs/usage.md`
- Create: `/Users/leo/github.com/yapi-plugin/docs/development.md`

- [ ] **Step 1: Document first-run setup and prerequisites**

Explain:
- Node/npm requirement
- auto-install behavior
- reuse of `~/.yapi/config.toml`
- login flow

- [ ] **Step 2: Document supported commands and examples**

Include examples for query and docs-sync flows.

- [ ] **Step 3: Run the full local verification suite**

Run:
- `node --test tests/*.test.mjs`
- `node scripts/validate-template.mjs`
- `git status --short`

Expected:
- tests pass
- template validation passes
- working tree only contains intended files

- [ ] **Step 4: Commit the initialized plugin repository**

```bash
git add .
git commit -m "feat: initialize yapi cursor plugin"
```
