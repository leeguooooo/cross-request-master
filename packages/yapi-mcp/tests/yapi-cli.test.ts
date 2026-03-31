import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(TEST_DIR, "..");
const CLI_ENTRY = path.join(PACKAGE_ROOT, "src", "yapi-cli.ts");
const TSX_BIN = path.join(
  PACKAGE_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

function createTempHome(): string {
  return mkdtempSync(path.join(tmpdir(), "yapi-cli-home-"));
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
  const yapiHome = path.join(options.homeDir, ".yapi");
  const child = spawn(TSX_BIN, [CLI_ENTRY, ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: options.homeDir,
      YAPI_HOME: yapiHome,
      YAPI_NO_UPDATE_CHECK: "1",
      FORCE_COLOR: "0",
      ...options.env,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`cli timed out: ${args.join(" ")}`));
    }, 10000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  return { status, stdout, stderr };
}

async function withServer(
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse<http.IncomingMessage>,
  ) => void | Promise<void>,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.stack || error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf8"));
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

afterEach(() => {
  delete process.env.YAPI_PANDOC_MAX_BUFFER;
});

describe("yapi cli docs-sync regression coverage", () => {
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
      assert.match(result.stderr, /yapi install-skill --force/);
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

  test("docs-sync binding run auto-recovers old relative dir against current repo", async () => {
    const homeDir = createTempHome();
    const yapiHome = ensureYapiHome(homeDir);
    const repoDir = path.join(homeDir, "tk.com", "ai-girls");
    const docsDir = path.join(repoDir, "docs", "yapi");
    mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(path.join(docsDir, "README.md"), "# demo\n", "utf8");
    writeFileSync(
      path.join(yapiHome, "docs-sync.json"),
      JSON.stringify(
        {
          version: 1,
          bindings: {
            broken: {
              dir: "docs/yapi",
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
      const result = await runCli(["docs-sync", "--binding", "broken", "--dry-run"], {
        cwd: repoDir,
        homeDir,
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /binding=broken/);
      assert.match(result.stdout, /docs\/yapi/);
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
});
