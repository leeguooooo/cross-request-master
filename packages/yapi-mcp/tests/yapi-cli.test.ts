import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { detectPackageManager } from "../src/cli/commands/self-update";
import { main as runMain } from "../src/yapi-cli";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, "..");
const MOCK_SERVER_HOST = "mock.yapi.test";
const mockServers = new Map<
  string,
  (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
  ) => void | Promise<void>
>();
const originalFetch = globalThis.fetch.bind(globalThis);
let mockFetchInstalled = false;
let nextMockServerId = 0;

function createTempHome(): string {
  return mkdtempSync(path.join(tmpdir(), "yapi-cli-home-"));
}

function withTempEnv<T>(mutations: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map(Object.keys(mutations).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(mutations)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function ensureYapiHome(homeDir: string, baseUrl = "https://unused.example.com"): string {
  const yapiHome = path.join(homeDir, ".yapi");
  mkdirSync(yapiHome, { recursive: true });
  writeFileSync(path.join(yapiHome, "config.toml"), `base_url = "${baseUrl}"\n`, "utf8");
  return yapiHome;
}

async function runCli(
  args: string[],
  options: {
    cwd: string;
    homeDir: string;
    env?: Record<string, string>;
  },
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  installMockFetch();
  const yapiHome = path.join(options.homeDir, ".yapi");
  let stdout = "";
  let stderr = "";
  const previousCwd = process.cwd();
  const previousExitCode = process.exitCode;
  const envKeys = [
    "HOME",
    "YAPI_HOME",
    "YAPI_NO_UPDATE_CHECK",
    "FORCE_COLOR",
    ...Object.keys(options.env || {}),
  ];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const stdoutCapture = ((chunk: unknown, encoding?: BufferEncoding, cb?: (error?: Error | null) => void) => {
    stdout += Buffer.isBuffer(chunk) ? chunk.toString(encoding || "utf8") : String(chunk);
    cb?.(null);
    return true;
  }) as typeof process.stdout.write;
  const stderrCapture = ((chunk: unknown, encoding?: BufferEncoding, cb?: (error?: Error | null) => void) => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString(encoding || "utf8") : String(chunk);
    cb?.(null);
    return true;
  }) as typeof process.stderr.write;

  process.chdir(options.cwd);
  process.stdout.write = stdoutCapture;
  process.stderr.write = stderrCapture;
  process.env.HOME = options.homeDir;
  process.env.YAPI_HOME = yapiHome;
  process.env.YAPI_NO_UPDATE_CHECK = "1";
  process.env.FORCE_COLOR = "0";
  for (const [key, value] of Object.entries(options.env || {})) {
    process.env[key] = value;
  }
  process.exitCode = undefined;

  let status: number | null = null;
  try {
    status = await Promise.race([
      runMain(args),
      new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error(`cli timed out: ${args.join(" ")}`)), 20000);
      }),
    ]);
  } finally {
    process.chdir(previousCwd);
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    process.exitCode = previousExitCode;
    for (const key of envKeys) {
      const value = previousEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  return { status, stdout, stderr };
}

async function withServer(
  handler: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
  ) => void | Promise<void>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const id = `server-${nextMockServerId++}`;
  mockServers.set(id, handler);
  return {
    url: `http://${MOCK_SERVER_HOST}/${id}`,
    close: async () => {
      mockServers.delete(id);
    },
  };
}

function installMockFetch(): void {
  if (mockFetchInstalled) return;
  mockFetchInstalled = true;
  globalThis.fetch = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname !== MOCK_SERVER_HOST) {
      return originalFetch(input, init);
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const serverId = segments.shift();
    if (!serverId) {
      return new Response("mock server not found", { status: 404 });
    }
    const handler = mockServers.get(serverId);
    if (!handler) {
      return new Response("mock server not found", { status: 404 });
    }

    const requestPath = `/${segments.join("/")}${url.search}`;
    const bodyText = await request.text();
    const req = Object.assign(Readable.from(bodyText ? [bodyText] : []), {
      method: request.method,
      url: requestPath,
      headers: Object.fromEntries(request.headers.entries()),
    }) as IncomingMessage;
    const responseState = createMockResponse();

    try {
      await handler(req, responseState.res);
    } catch (error) {
      responseState.res.statusCode = 500;
      responseState.res.end(error instanceof Error ? error.stack || error.message : String(error));
    }

    return responseState.toResponse();
  };
}

function createMockResponse(): {
  res: ServerResponse<IncomingMessage>;
  toResponse: () => Response;
} {
  let statusCode = 200;
  const headers = new Headers();
  const chunks: string[] = [];

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      }
      return this;
    },
  } as unknown as ServerResponse<IncomingMessage>;

  return {
    res,
    toResponse: () =>
      new Response(chunks.join(""), {
        status: statusCode,
        headers,
      }),
  };
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeSkillInstall(homeDir: string, version: string): string {
  const codexHome = path.join(homeDir, ".codex");
  const skillRoot = path.join(codexHome, "skills", "yapi");
  mkdirSync(skillRoot, { recursive: true });
  writeFileSync(path.join(skillRoot, "SKILL.md"), "# yapi\n", "utf8");
  writeFileSync(
    path.join(skillRoot, ".yapi-skill.json"),
    JSON.stringify(
      {
        skillName: "yapi",
        packageName: "@leeguoo/yapi-mcp",
        packageVersion: version,
        installedAt: "2026-03-01T00:00:00.000Z",
      },
      null,
      2,
    ),
    "utf8",
  );
  return codexHome;
}

function installFakeMmdc(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "mmdc");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("11.12.0\\n");
  process.exit(0);
}
const input = args[args.indexOf("-i") + 1];
const output = args[args.indexOf("-o") + 1];
const source = fs.readFileSync(input, "utf8");
const big = source.includes("BIG");
const repeated = "X".repeat(big ? 180000 : 2000);
fs.writeFileSync(output, "<svg><text>" + repeated + "</text></svg>", "utf8");
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
}

function installFakeMmdcMissingBrowser(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "mmdc");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("11.12.0\\n");
  process.exit(0);
}
process.stderr.write("Error: Could not find Chrome (ver. 123). chrome-headless-shell is missing.\\n");
process.exit(1);
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
}

function installFakeMmdcClassicFallback(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "mmdc");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("11.12.0\\n");
  process.exit(0);
}
const output = args[args.indexOf("-o") + 1];
const configPath = args.includes("-c") ? args[args.indexOf("-c") + 1] : "";
let repeated = "X".repeat(180000);
if (configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.look === "classic") {
    repeated = "X".repeat(2000);
  }
}
fs.writeFileSync(output, "<svg><text>" + repeated + "</text></svg>", "utf8");
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
}

function installFakeMmdcAlwaysLarge(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "mmdc");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("11.12.0\\n");
  process.exit(0);
}
const output = args[args.indexOf("-o") + 1];
const configPath = args.includes("-c") ? args[args.indexOf("-c") + 1] : "";
let repeated = "X".repeat(180000);
if (configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.look === "classic") {
    repeated = "X".repeat(120000);
  }
}
fs.writeFileSync(output, "<svg><text>" + repeated + "</text></svg>", "utf8");
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
}

afterEach(() => {
  delete process.env.YAPI_PANDOC_MAX_BUFFER;
  mockServers.clear();
});

describe("yapi cli docs-sync regression coverage", () => {
  test("detectPackageManager defaults to npm", () => {
    const manager = withTempEnv(
      { npm_execpath: undefined },
      () => detectPackageManager({ dirnameHint: "/tmp/yapi-mcp/dist/cli", bunVersion: undefined }),
    );

    assert.equal(manager.bin, "npm");
    assert.deepEqual(manager.installArgs("@leeguoo/yapi-mcp@latest"), [
      "install",
      "-g",
      "@leeguoo/yapi-mcp@latest",
    ]);
    assert.deepEqual(manager.viewArgs("@leeguoo/yapi-mcp"), [
      "view",
      "@leeguoo/yapi-mcp",
      "version",
      "--json",
    ]);
  });

  test("detectPackageManager prefers pnpm when npm_execpath points to pnpm", () => {
    const manager = withTempEnv(
      { npm_execpath: "/Users/test/Library/pnpm/pnpm.cjs" },
      () => detectPackageManager({ dirnameHint: "/tmp/yapi-mcp/dist/cli", bunVersion: undefined }),
    );

    assert.equal(manager.bin, "pnpm");
    assert.deepEqual(manager.installArgs("@leeguoo/yapi-mcp@latest"), [
      "add",
      "-g",
      "@leeguoo/yapi-mcp@latest",
    ]);
    assert.deepEqual(manager.viewArgs("@leeguoo/yapi-mcp"), [
      "view",
      "@leeguoo/yapi-mcp",
      "version",
      "--json",
    ]);
  });

  test("detectPackageManager detects pnpm from __dirname-style path", () => {
    const manager = withTempEnv(
      { npm_execpath: undefined },
      () =>
        detectPackageManager({
          dirnameHint: "/tmp/project/node_modules/.pnpm/@leeguoo+yapi-mcp/dist/cli",
          bunVersion: undefined,
        }),
    );

    assert.equal(manager.bin, "pnpm");
    assert.deepEqual(manager.installArgs("@leeguoo/yapi-mcp@latest"), [
      "add",
      "-g",
      "@leeguoo/yapi-mcp@latest",
    ]);
  });

  test("detectPackageManager detects yarn from __dirname-style path", () => {
    const manager = withTempEnv(
      { npm_execpath: undefined },
      () =>
        detectPackageManager({
          dirnameHint: "/tmp/project/.yarn/cache/@leeguoo-yapi-mcp/dist/cli",
          bunVersion: undefined,
        }),
    );

    assert.equal(manager.bin, "yarn");
    assert.deepEqual(manager.installArgs("@leeguoo/yapi-mcp@latest"), [
      "global",
      "add",
      "@leeguoo/yapi-mcp@latest",
    ]);
    assert.deepEqual(manager.viewArgs("@leeguoo/yapi-mcp"), [
      "view",
      "@leeguoo/yapi-mcp",
      "version",
      "--json",
    ]);
  });

  test("config init writes config for browser-first global auth", async () => {
    const homeDir = createTempHome();
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-config-init-"));

    const result = await runCli(
      [
        "config",
        "init",
        "--base-url",
        "https://yapi.example.com",
        "--auth-mode",
        "global",
        "--email",
        "demo@example.com",
      ],
      { cwd: repoDir, homeDir },
    );

    assert.equal(result.status, 0, result.stderr);
    const configText = readFileSync(path.join(homeDir, ".yapi", "config.toml"), "utf8");
    assert.match(configText, /base_url = "https:\/\/yapi\.example\.com"/);
    assert.match(configText, /auth_mode = "global"/);
    assert.match(configText, /email = "demo@example\.com"/);
    assert.match(configText, /password = ""/);
    assert.match(result.stdout, /config written to:/i);
    assert.match(result.stdout, /browser/i);
  });

  test("self-update delegates to npm install -g latest package", async () => {
    const homeDir = createTempHome();
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-self-update-"));
    const binDir = path.join(homeDir, "bin");
    const logPath = path.join(homeDir, "npm.log");
    mkdirSync(binDir, { recursive: true });
    const npmPath = path.join(binDir, "npm");
    writeFileSync(
      npmPath,
      `#!/bin/sh
if [ "$1" = "view" ]; then
  echo '"0.6.0"'
  exit 0
fi
echo "$@" > ${JSON.stringify(logPath)}
exit 0
`,
      "utf8",
    );
    chmodSync(npmPath, 0o755);

    const result = await runCli(["self-update"], {
      cwd: repoDir,
      homeDir,
      env: {
        PATH: `${binDir}:${process.env.PATH || ""}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(logPath, "utf8"), /install -g @leeguoo\/yapi-mcp@latest/);
    assert.match(result.stdout, /updated yapi cli/i);
  });

  test("self-update skips install when latest version is already installed", async () => {
    const homeDir = createTempHome();
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-self-update-current-"));
    const binDir = path.join(homeDir, "bin");
    const logPath = path.join(homeDir, "npm.log");
    mkdirSync(binDir, { recursive: true });
    const npmPath = path.join(binDir, "npm");
    writeFileSync(
      npmPath,
      `#!/bin/sh
echo "$@" >> ${JSON.stringify(logPath)}
if [ "$1" = "view" ]; then
  echo '"0.5.0"'
  exit 0
fi
exit 0
`,
      "utf8",
    );
    chmodSync(npmPath, 0o755);

    const result = await runCli(["self-update"], {
      cwd: repoDir,
      homeDir,
      env: {
        PATH: `${binDir}:${process.env.PATH || ""}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const logText = readFileSync(logPath, "utf8");
    assert.match(logText, /view @leeguoo\/yapi-mcp version --json/);
    assert.doesNotMatch(logText, /install -g @leeguoo\/yapi-mcp@latest/);
    assert.match(result.stdout, /already up to date/i);
  });

  test("self-update reports a clear error when npm is unavailable", async () => {
    const homeDir = createTempHome();
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-self-update-missing-npm-"));

    const result = await runCli(["self-update"], {
      cwd: repoDir,
      homeDir,
      env: {
        PATH: "",
      },
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /npm was not found in PATH/i);
  });

  test("warns when installed skill metadata is older than current package version", async () => {
    const homeDir = createTempHome();
    ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-skillwarn-"));
    const codexHome = path.join(homeDir, ".codex");
    const skillRoot = path.join(codexHome, "skills", "yapi");
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(path.join(skillRoot, "SKILL.md"), "# yapi\n", "utf8");
    writeFileSync(
      path.join(skillRoot, ".yapi-skill.json"),
      JSON.stringify(
        {
          skillName: "yapi",
          packageName: "@leeguoo/yapi-mcp",
          packageVersion: "0.3.20",
          installedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );

    const server = await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await runCli(["--url", `${server.url}/health`], {
        cwd: repoDir,
        homeDir,
        env: {
          CODEX_HOME: codexHome,
        },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /skill update available/i);
      assert.match(result.stderr, /npx skills add leeguooooo\/cross-request-master -y -g/);
    } finally {
      await server.close();
    }
  });

  test("bind add stores repo-relative-to-home dir when using global ~/.yapi", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "ai-girls");
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    mkdirSync(path.join(repoDir, "docs", "yapi"), { recursive: true });

    const result = await runCli(
      [
        "docs-sync",
        "bind",
        "add",
        "--name",
        "projectA",
        "--dir",
        "docs/yapi",
        "--project-id",
        "267",
        "--catid",
        "3667",
      ],
      { cwd: repoDir, homeDir },
    );

    assert.equal(result.status, 0, result.stderr);
    const config = readJson(path.join(yapiHome, "docs-sync.json"));
    assert.equal(config.bindings.projectA.dir, path.join("tk.com", "ai-girls", "docs", "yapi"));
    assert.match(result.stdout, /resolved/i);
  });

  test("bind show matches bind get output for the same binding", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "bind-show-demo");
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    writeFileSync(
      path.join(yapiHome, "docs-sync.json"),
      JSON.stringify(
        {
          version: 1,
          bindings: {
            docs: {
              dir: "docs/yapi",
              project_id: 267,
              catid: 3667,
              template_id: 88,
              files: { "alpha.md": 101, "beta.md": 102 },
              file_hashes: { "alpha.md": "hash-alpha", "beta.md": "hash-beta" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const getResult = await runCli(["docs-sync", "bind", "get", "--name", "docs"], {
      cwd: repoDir,
      homeDir,
    });
    const showResult = await runCli(["docs-sync", "bind", "show", "--name", "docs"], {
      cwd: repoDir,
      homeDir,
    });

    assert.equal(getResult.status, 0, getResult.stderr);
    assert.equal(showResult.status, 0, showResult.stderr);
    assert.equal(showResult.stdout, getResult.stdout);
  });

  test("bind get prints structured files mapping in JSON output", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "bind-get-demo");
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    writeFileSync(
      path.join(yapiHome, "docs-sync.json"),
      JSON.stringify(
        {
          version: 1,
          bindings: {
            docs: {
              dir: "docs/yapi",
              project_id: 267,
              catid: 3667,
              files: { "alpha.md": 101 },
              file_hashes: { "alpha.md": "hash-alpha" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCli(["docs-sync", "bind", "get", "--name", "docs"], {
      cwd: repoDir,
      homeDir,
    });

    assert.equal(result.status, 0, result.stderr);
    const [jsonText] = result.stdout.split("summary:\n");
    const payload = JSON.parse(jsonText);
    assert.deepEqual(payload.files, {
      "alpha.md": {
        doc_id: 101,
        hash: "hash-alpha",
      },
    });
    assert.match(result.stdout, /summary:/);
  });

  test("docs-sync binding dir mismatch suggests bind update command for matching candidate", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "ai-girls");
    const docsDir = path.join(repoDir, "docs", "yapi-sync", "projectA");
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(path.join(docsDir, "a.md"), "# a\n", "utf8");
    writeFileSync(path.join(docsDir, "b.md"), "# b\n", "utf8");
    writeFileSync(path.join(docsDir, "c.md"), "# c\n", "utf8");
    writeFileSync(
      path.join(yapiHome, "docs-sync.json"),
      JSON.stringify(
        {
          version: 1,
          bindings: {
            projectA: {
              dir: "docs/old/path",
              project_id: 267,
              catid: 3667,
              files: {
                "a.md": 101,
                "b.md": 102,
                "c.md": 103,
              },
              file_hashes: {},
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCli(["docs-sync", "--binding", "projectA", "--dry-run"], {
      cwd: repoDir,
      homeDir,
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /binding 'projectA' dir=docs\/old\/path/);
    assert.match(result.stderr, /候选目录（命中 3\/3 文件）/);
    assert.match(result.stderr, /docs\/yapi-sync\/projectA/);
    assert.match(
      result.stderr,
      /hint: yapi docs-sync bind update --name projectA --dir docs\/yapi-sync\/projectA/,
    );
  });

  test("docs-sync binding dir mismatch falls back to generic bind update template when no candidates found", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "no-candidate-demo");
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    mkdirSync(path.join(repoDir, "docs", "misc"), { recursive: true });
    writeFileSync(path.join(repoDir, "docs", "misc", "unrelated.md"), "# unrelated\n", "utf8");
    writeFileSync(
      path.join(yapiHome, "docs-sync.json"),
      JSON.stringify(
        {
          version: 1,
          bindings: {
            projectA: {
              dir: "docs/old/path",
              project_id: 267,
              catid: 3667,
              files: {
                "alpha.md": 101,
                "beta.md": 102,
              },
              file_hashes: {},
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCli(["docs-sync", "--binding", "projectA", "--dry-run"], {
      cwd: repoDir,
      homeDir,
    });

    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /hint: yapi docs-sync bind update --name projectA --dir <new-relative-path>/,
    );
  });

  test("docs-sync --watch yargs flag is accepted and exits when no watch targets resolved", async () => {
    const homeDir = createTempHome();
    ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-watch-"));

    const result = await runCli(
      ["docs-sync", "--binding", "does-not-exist", "--watch"],
      { cwd: repoDir, homeDir },
    );

    assert.equal(result.status, 2);
    const combined = result.stdout + result.stderr;
    assert.match(combined, /\[watch\] /, "should reach the watch code path");
    assert.match(
      combined,
      /no directories to watch|binding not found/,
      "should fail-fast when nothing is watchable",
    );
  });

  test("docs-sync skips unchanged files before Mermaid rendering on normal sync", async () => {
    const homeDir = createTempHome();
    ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-skip-render-"));
    const docsDir = path.join(repoDir, "docs", "release-notes");
    const binDir = path.join(homeDir, "bin");
    installFakeMmdc(binDir);
    mkdirSync(docsDir, { recursive: true });

    const markdown = `# demo

\`\`\`mermaid
graph TD
  A[Start] --> B[Done]
\`\`\`
`;
    writeFileSync(path.join(docsDir, "demo.md"), markdown, "utf8");
    writeFileSync(
      path.join(docsDir, ".yapi.json"),
      JSON.stringify(
        {
          project_id: 267,
          catid: 3667,
          files: { "demo.md": 123 },
          file_hashes: {
            "demo.md": crypto
              .createHash("sha1")
              .update("mermaid\n")
              .update("mermaid-look:handDrawn\n")
              .update(markdown)
              .digest("hex"),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const server = await withServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            errcode: 0,
            data: {
              list: [{ _id: 123, path: "/demo", title: "demo" }],
            },
          }),
        );
        return;
      }
      if (url.pathname === "/api/interface/up") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ errcode: 0, data: {} }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      writeFileSync(path.join(homeDir, ".yapi", "config.toml"), `base_url = "${server.url}"\n`, "utf8");
      const result = await runCli(["docs-sync", docsDir], {
        cwd: repoDir,
        homeDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          YAPI_MMDC_PATH: path.join(binDir, "mmdc"),
        },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /skipped=1/);
      assert.doesNotMatch(result.stdout, /Mermaid 块 #1/);
    } finally {
      await server.close();
    }
  });

  test("supports curl-style merged query strings with a single --query flag", async () => {
    const homeDir = createTempHome();
    ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-query-"));

    const server = await withServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          query: Object.fromEntries(url.searchParams.entries()),
        }),
      );
    });

    try {
      const result = await runCli(
        [
          "--url",
          `${server.url}/api/interface/list_cat`,
          "--query",
          "catid=4631&limit=50&page=1",
        ],
        { cwd: repoDir, homeDir },
      );

      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(payload.query, { catid: "4631", limit: "50", page: "1" });
    } finally {
      await server.close();
    }
  });

  test("docs-sync dry-run previews per-file sizes without touching mapping files", async () => {
    const homeDir = createTempHome();
    const repoDir = path.join(homeDir, "tk.com", "dry-run-demo");
    const docsDir = path.join(repoDir, "docs", "release-notes");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    writeFileSync(path.join(docsDir, "hello.md"), "# Hello\n\nbody\n", "utf8");

    let addCalls = 0;
    let updateCalls = 0;
    const server = await withServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ errcode: 0, data: { list: [] } }));
        return;
      }
      if (url.pathname === "/api/interface/add") {
        addCalls += 1;
      }
      if (url.pathname === "/api/interface/up") {
        updateCalls += 1;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      ensureYapiHome(homeDir, server.url);
      const result = await runCli(["docs-sync", "--dir", docsDir, "--dry-run"], {
        cwd: repoDir,
        homeDir,
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /dry-run/i);
      assert.match(result.stdout, /file=hello\.md/);
      assert.equal(addCalls, 0);
      assert.equal(updateCalls, 0);
      assert.equal(existsSync(path.join(docsDir, ".yapi.json")), false);
    } finally {
      await server.close();
    }
  });

  test("shows actionable 413 diagnostics including payload size and largest mermaid block", async () => {
    const homeDir = createTempHome();
    const repoDir = path.join(homeDir, "tk.com", "oversize-demo");
    const docsDir = path.join(repoDir, "docs", "yapi");
    const binDir = path.join(homeDir, "bin");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    installFakeMmdc(binDir);
    writeFileSync(
      path.join(docsDir, "big.md"),
      [
        "# Big Diagram",
        "",
        "```mermaid",
        "graph TD",
        "BIG[Huge Block]",
        "```",
        "",
        "```mermaid",
        "graph TD",
        "SMALL[Small Block]",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(docsDir, ".yapi.json"),
      JSON.stringify(
        {
          project_id: 267,
          catid: 3667,
          files: { "big.md": 123 },
          file_hashes: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    const server = await withServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            errcode: 0,
            data: { list: [{ _id: 123, path: "/big", title: "Big Diagram" }] },
          }),
        );
        return;
      }
      if (url.pathname === "/api/interface/up") {
        res.statusCode = 413;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("Payload Too Large. Limit: 1048576 bytes");
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      ensureYapiHome(homeDir, server.url);
      const result = await runCli(["docs-sync", "--dir", docsDir], {
        cwd: repoDir,
        homeDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          YAPI_MMDC_PATH: path.join(binDir, "mmdc"),
        },
      });

      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, /413/i);
      assert.match(result.stderr, /payload/i);
      assert.match(result.stderr, /limit/i);
      assert.match(result.stderr, /largest mermaid/i);
      assert.match(result.stderr, /dry-run/i);
    } finally {
      await server.close();
    }
  });

  test("warns clearly when mmdc browser runtime is missing", async () => {
    const homeDir = createTempHome();
    const repoDir = path.join(homeDir, "tk.com", "missing-browser-demo");
    const docsDir = path.join(repoDir, "docs", "yapi");
    const binDir = path.join(homeDir, "bin");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    installFakeMmdcMissingBrowser(binDir);
    writeFileSync(
      path.join(docsDir, "demo.md"),
      ["# Demo", "", "```mermaid", "graph TD", "A[Start] --> B[Done]", "```", ""].join("\n"),
      "utf8",
    );

    const server = await withServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ errcode: 0, data: { list: [] } }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      ensureYapiHome(homeDir, server.url);
      const result = await runCli(["docs-sync", "--dir", docsDir, "--dry-run"], {
        cwd: repoDir,
        homeDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          YAPI_MMDC_PATH: path.join(binDir, "mmdc"),
        },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /chrome-headless-shell/i);
      assert.match(result.stderr, /puppeteer browsers install chrome-headless-shell/i);
    } finally {
      await server.close();
    }
  });

  test("auto-retries oversized Mermaid payloads with classic look", async () => {
    const homeDir = createTempHome();
    const repoDir = path.join(homeDir, "tk.com", "classic-fallback-demo");
    const docsDir = path.join(repoDir, "docs", "yapi");
    const binDir = path.join(homeDir, "bin");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    installFakeMmdcClassicFallback(binDir);
    writeFileSync(
      path.join(docsDir, "big.md"),
      ["# Big Diagram", "", "```mermaid", "graph TD", "A[Start] --> B[Done]", "```", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(docsDir, ".yapi.json"),
      JSON.stringify(
        {
          project_id: 267,
          catid: 3667,
          files: { "big.md": 123 },
          file_hashes: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    let updateCalls = 0;
    const server = await withServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            errcode: 0,
            data: { list: [{ _id: 123, path: "/big", title: "Big Diagram" }] },
          }),
        );
        return;
      }
      if (url.pathname === "/api/interface/up") {
        updateCalls += 1;
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const payload = JSON.parse(body) as { desc?: string };
        if ((payload.desc || "").length > 100000) {
          res.statusCode = 413;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end("Payload Too Large. Limit: 1048576 bytes");
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ errcode: 0, data: {} }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      ensureYapiHome(homeDir, server.url);
      const result = await runCli(["docs-sync", "--dir", docsDir], {
        cwd: repoDir,
        homeDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          YAPI_MMDC_PATH: path.join(binDir, "mmdc"),
        },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(updateCalls, 2);
      assert.match(result.stderr, /retrying with --mermaid-classic/i);
    } finally {
      await server.close();
    }
  });

  test("supports one-off --source-file filtering in binding mode", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "binding-source-file-demo");
    const docsDir = path.join(repoDir, "docs", "yapi");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    writeFileSync(path.join(docsDir, "alpha.md"), "# Alpha\n", "utf8");
    writeFileSync(path.join(docsDir, "beta.md"), "# Beta\n", "utf8");
    writeFileSync(
      path.join(yapiHome, "docs-sync.json"),
      JSON.stringify(
        {
          version: 1,
          bindings: {
            docs: {
              dir: path.join("tk.com", "binding-source-file-demo", "docs", "yapi"),
              project_id: 267,
              catid: 3667,
              files: {},
              file_hashes: {},
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const server = await withServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ errcode: 0, data: { list: [] } }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      writeFileSync(path.join(yapiHome, "config.toml"), `base_url = "${server.url}"\n`, "utf8");
      const result = await runCli(
        ["docs-sync", "--binding", "docs", "--source-file", "alpha.md", "--dry-run"],
        {
          cwd: repoDir,
          homeDir,
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /file=alpha\.md/);
      assert.doesNotMatch(result.stdout, /file=beta\.md/);
    } finally {
      await server.close();
    }
  });

  test("remembers no-mermaid fallback after repeated 413 retries", async () => {
    const homeDir = createTempHome();
    const repoDir = path.join(homeDir, "tk.com", "remember-fallback-demo");
    const docsDir = path.join(repoDir, "docs", "yapi");
    const binDir = path.join(homeDir, "bin");
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    installFakeMmdcAlwaysLarge(binDir);
    writeFileSync(
      path.join(docsDir, "architecture.md"),
      ["# Architecture", "", "```mermaid", "graph TD", "A[Start] --> B[Done]", "```", ""].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(docsDir, ".yapi.json"),
      JSON.stringify(
        {
          project_id: 267,
          catid: 3667,
          files: { "architecture.md": 123 },
          file_hashes: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    let updateCalls = 0;
    const server = await withServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/interface/list_cat") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            errcode: 0,
            data: { list: [{ _id: 123, path: "/architecture", title: "Architecture" }] },
          }),
        );
        return;
      }
      if (url.pathname === "/api/interface/up") {
        updateCalls += 1;
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const payload = JSON.parse(body) as { desc?: string };
        if ((payload.desc || "").length > 100000) {
          res.statusCode = 413;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end("Payload Too Large. Limit: 1048576 bytes");
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ errcode: 0, data: {} }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });

    try {
      ensureYapiHome(homeDir, server.url);
      const first = await runCli(["docs-sync", "--dir", docsDir], {
        cwd: repoDir,
        homeDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          YAPI_MMDC_PATH: path.join(binDir, "mmdc"),
        },
      });

      assert.equal(first.status, 0, first.stderr);
      assert.equal(updateCalls, 3);
      assert.match(first.stderr, /retrying with --mermaid-classic/i);
      assert.match(first.stderr, /retrying with --no-mermaid/i);

      const mapping = readJson(path.join(docsDir, ".yapi.json"));
      assert.equal(mapping.file_render_modes["architecture.md"], "no-mermaid");

      const second = await runCli(["docs-sync", "--dir", docsDir], {
        cwd: repoDir,
        homeDir,
        env: {
          PATH: `${binDir}:${process.env.PATH || ""}`,
          YAPI_MMDC_PATH: path.join(binDir, "mmdc"),
        },
      });

      assert.equal(second.status, 0, second.stderr);
      assert.equal(updateCalls, 3);
      assert.match(second.stdout, /skipped=1/);
      assert.doesNotMatch(second.stderr, /retrying with --mermaid-classic/i);
    } finally {
      await server.close();
    }
  });
});

describe("yapi cli interface list-menu filtering", () => {
  function listMenuFixture() {
    return {
      errcode: 0,
      errmsg: "ok",
      data: [
        {
          _id: 100,
          name: "Auth",
          list: [
            { _id: 1, title: "Login", path: "/api/auth/login", method: "POST", project_id: 365, catid: 100 },
            { _id: 2, title: "Get Token", path: "/api/auth/token", method: "POST", project_id: 365, catid: 100 },
            { _id: 3, title: "Logout", path: "/api/auth/logout", method: "POST", project_id: 365, catid: 100 },
          ],
        },
        {
          _id: 101,
          name: "User",
          list: [
            { _id: 4, title: "Get user", path: "/api/user/get", method: "GET", project_id: 365, catid: 101 },
            { _id: 5, title: "Refresh token", path: "/api/user/token/refresh", method: "POST", project_id: 365, catid: 101 },
          ],
        },
      ],
    };
  }

  async function runListMenuCli(args: string[]) {
    const homeDir = createTempHome();
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-listmenu-"));
    const server = await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/api/interface/list_menu")) {
        res.end(JSON.stringify(listMenuFixture()));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    try {
      const result = await runCli(
        [
          "interface",
          "list-menu",
          "--base-url",
          server.url,
          "--project-id",
          "365",
          "--auth-mode",
          "token",
          "--token",
          "any",
          ...args,
        ],
        { cwd: repoDir, homeDir },
      );
      return result;
    } finally {
      await server.close();
    }
  }

  test("filters menu by --path substring (case-insensitive)", async () => {
    const result = await runListMenuCli(["--path", "/api/AUTH/token"]);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.data.total, 1);
    assert.equal(out.data.matches[0].path, "/api/auth/token");
    assert.equal(out.data.matches[0]._id, 2);
    assert.equal(out.data.matches[0].cat_name, "Auth");
  });

  test("filters menu by --method (exact match, case-insensitive)", async () => {
    const result = await runListMenuCli(["--method", "get"]);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.data.total, 1);
    assert.equal(out.data.matches[0].method, "GET");
    assert.equal(out.data.matches[0].path, "/api/user/get");
  });

  test("combines --path and --method filters with AND semantics", async () => {
    const result = await runListMenuCli(["--path", "/api/auth", "--method", "POST"]);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.data.total, 3);
    const paths = out.data.matches.map((m: { path: string }) => m.path).sort();
    assert.deepEqual(paths, ["/api/auth/login", "/api/auth/logout", "/api/auth/token"]);
  });

  test("returns empty matches when nothing matches the filter", async () => {
    const result = await runListMenuCli(["--path", "/no/such/route"]);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.data.total, 0);
    assert.deepEqual(out.data.matches, []);
  });

  test("passes through full menu when no filter is given", async () => {
    const result = await runListMenuCli([]);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    // unchanged shape: data is the raw category list
    assert.equal(Array.isArray(out.data), true);
    assert.equal(out.data.length, 2);
    assert.equal(out.data[0].name, "Auth");
  });

  test("skill update reminder=never suppresses warning", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-skillwarn-never-"));
    const codexHome = writeSkillInstall(homeDir, "0.3.20");
    writeFileSync(
      path.join(yapiHome, "config.toml"),
      'base_url = "https://unused.example.com"\nskill_update_reminder = "never"\n',
      "utf8",
    );

    const server = await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await runCli(["--url", `${server.url}/health`], {
        cwd: repoDir,
        homeDir,
        env: { CODEX_HOME: codexHome },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stderr, /skill update available/i);
    } finally {
      await server.close();
    }
  });

  test("skill update reminder=daily suppresses warning within 24 hours", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-skillwarn-daily-fresh-"));
    const codexHome = writeSkillInstall(homeDir, "0.3.20");
    writeFileSync(
      path.join(yapiHome, "config.toml"),
      'base_url = "https://unused.example.com"\nskill_update_reminder = "daily"\n',
      "utf8",
    );
    writeFileSync(
      path.join(yapiHome, ".skill-update-reminder-cache.json"),
      `${JSON.stringify({ lastWarnedAt: Date.now() - 100 }, null, 2)}\n`,
      "utf8",
    );

    const server = await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await runCli(["--url", `${server.url}/health`], {
        cwd: repoDir,
        homeDir,
        env: { CODEX_HOME: codexHome },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stderr, /skill update available/i);
    } finally {
      await server.close();
    }
  });

  test("skill update reminder=daily warns after 24 hours and updates cache", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-skillwarn-daily-stale-"));
    const codexHome = writeSkillInstall(homeDir, "0.3.20");
    writeFileSync(
      path.join(yapiHome, "config.toml"),
      'base_url = "https://unused.example.com"\nskill_update_reminder = "daily"\n',
      "utf8",
    );
    const cachePath = path.join(yapiHome, ".skill-update-reminder-cache.json");
    const staleAt = Date.now() - 48 * 3600 * 1000;
    writeFileSync(
      cachePath,
      `${JSON.stringify({ lastWarnedAt: staleAt }, null, 2)}\n`,
      "utf8",
    );

    const server = await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await runCli(["--url", `${server.url}/health`], {
        cwd: repoDir,
        homeDir,
        env: { CODEX_HOME: codexHome },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /skill update available/i);
      const cache = readJson(cachePath);
      assert.equal(typeof cache.lastWarnedAt, "number");
      assert.ok(cache.lastWarnedAt > staleAt);
    } finally {
      await server.close();
    }
  });

  test("skill update reminder=always preserves current warning behavior", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = mkdtempSync(path.join(tmpdir(), "yapi-cli-skillwarn-always-"));
    const codexHome = writeSkillInstall(homeDir, "0.3.20");
    writeFileSync(
      path.join(yapiHome, "config.toml"),
      'base_url = "https://unused.example.com"\nskill_update_reminder = "always"\n',
      "utf8",
    );

    const server = await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    try {
      const result = await runCli(["--url", `${server.url}/health`], {
        cwd: repoDir,
        homeDir,
        env: { CODEX_HOME: codexHome },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /skill update available/i);
    } finally {
      await server.close();
    }
  });
});
