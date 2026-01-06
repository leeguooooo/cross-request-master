# Releasing `@leeguoo/yapi-mcp`

This repo is a maintained fork for publishing to npm so users can run it via `npx`.

## Prereqs

- Node.js 20.x
- `npm login` (npmjs.org)

## Publish

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build

# bump version in package.json first (semver)
npm publish --access public
```
