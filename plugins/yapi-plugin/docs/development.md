# Development

## Local commands

- `npm test`
- `npm run validate`

## Script entrypoints

- `node scripts/ensure-yapi.mjs`
- `node scripts/setup-yapi.mjs`
- `node scripts/run-yapi.mjs whoami`

## Notes

- Wrapper scripts print JSON so command prompts can reason about stable fields
- Authentication remains owned by the upstream `yapi login` flow
