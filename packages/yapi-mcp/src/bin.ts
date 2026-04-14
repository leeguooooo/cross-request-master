#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Bin wrapper: preflights critical runtime deps so users hit a friendly error
 * instead of a raw "Cannot find module 'yargs'" stack trace when the package
 * directory is missing node_modules (e.g. local clone without install, broken
 * package manager switch).
 */
const REQUIRED_DEPS = ["yargs", "axios"];

const missing: string[] = [];
for (const dep of REQUIRED_DEPS) {
  try {
    require.resolve(dep);
  } catch {
    missing.push(dep);
  }
}

if (missing.length > 0) {
  const path = require("path") as typeof import("path");
  const pkgDir = path.resolve(__dirname, "..");
  const lines = [
    `[yapi-cli] Missing runtime dependencies: ${missing.join(", ")}`,
    "",
    "This usually means the package directory has no node_modules installed.",
    "",
    "To fix, run one of the following in the package directory:",
    `  cd "${pkgDir}"`,
    "  pnpm install           # if using pnpm (recommended for this repo)",
    "  # or",
    "  npm install            # if using npm",
    "",
    "If you installed @leeguoo/yapi-mcp globally, try reinstalling:",
    "  npm i -g @leeguoo/yapi-mcp",
  ];
  // eslint-disable-next-line no-console
  console.error(lines.join("\n"));
  process.exit(1);
}

// All good — delegate to the real CLI entry.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { main } = require("./yapi-cli") as { main: () => Promise<number> };
main()
  .then((code: number) => {
    if (process.exitCode === undefined || process.exitCode === null) {
      process.exitCode = code;
    }
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
