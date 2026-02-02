# Releasing `@leeguoo/yapi-mcp`

This repo is a maintained fork for publishing to npm so users can run it via `npx`.

## Prereqs

- Node.js 24.x
- npm Trusted Publisher configured for this repo (workflow: `publish-npm.yml`)

## Publish (tag trigger)

1. Bump version in `packages/yapi-mcp/package.json`.
2. Commit the change.
3. Create a matching tag and push it:

```bash
git tag -a v0.3.16 -m "release yapi-mcp v0.3.16"
git push origin v0.3.16
```

The GitHub Actions workflow will build and publish when the tag matches the package version.
