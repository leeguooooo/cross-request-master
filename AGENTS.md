# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` defines the MV3 extension; `background.js` (service worker) and `content-script.js` handle runtime logic; `index.js` exposes the in-page API; `popup.html`/`popup.js` render the UI; `icons/`, `images/`, and `screenshots/` hold assets.
- Shared utilities live in `src/helpers/` (`body-parser.js`, `logger.js`, `query-string.js`, `response-handler.js`); reuse these instead of duplicating logic.
- Jest suites are under `tests/` (`helpers.test.js`, `jquery-ajax.test.js`, `yapi-context.test.js`); release helpers sit in `scripts/`; `build-extension.sh` creates the `build/` folder and versioned ZIPs.
- Top-level `.md` files document releases, privacy, permissions, and store submission checklists—update them when related areas change.

## Build, Test, and Development Commands
- Install: `pnpm install`. Enable local hooks: `pnpm hooks:install` (pre-commit lint/format, pre-push test + release check).
- Lint: `pnpm lint` / `pnpm lint:fix`.
- Format: `pnpm format` / `pnpm format:check` (JS/JSON/MD).
- Tests: `pnpm test` (Jest + jsdom), `pnpm test:watch`, `pnpm test:coverage`.
- Release sanity: `pnpm release:check`.
- Package for Chrome: `./build-extension.sh`, then load the `build/` directory via `chrome://extensions` or upload the generated `cross-request-master-v*.zip`.

## Coding Style & Naming Conventions
- JavaScript with 2-space indentation, single quotes, trailing semicolons; rely on Prettier/ESLint defaults.
- CamelCase for variables/functions; uppercase constants; keep helper functions small and placed in `src/helpers/`.
- Keep manifest permissions minimal; document any additions in `PERMISSION_JUSTIFICATION.md`.
- Log messages often include concise Chinese text—match existing tone and brevity.

## Testing Guidelines
- Follow the existing pattern in `tests/*.test.js` (descriptive `describe` blocks, focused `test` cases).
- Cover edge cases that previously regressed (falsy body handling, GET/HEAD bodies being ignored, YApi callback shapes, jQuery interception).
- Prefer importing real helpers from `src/helpers/` over stubbing to avoid “false green” tests.
- Run `pnpm test:coverage` after modifying shared helpers to ensure branches stay exercised.

## Commit & Pull Request Guidelines
- Use conventional commits seen in history (`feat:`, `fix(response-handling):`, `chore:`); include a scope when it clarifies the surface area.
- PRs should state the behavior change, risks, and manual verification steps (e.g., screenshots of the cURL popup, console logs for YApi detection).
- Link related issues, note any manifest/permission changes, and list commands run (lint/tests/release check) before requesting review.
