#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { Options, DocsSyncOptions, DocsSyncBindArgs } from "./cli/types";
import {
  readVersion,
  readUpdateCache,
  writeUpdateCache,
  isNewerVersion,
  UPDATE_CHECK_TTL_MS,
} from "./cli/utils";
import { fetchWithTimeout } from "./cli/http";
import { findOutdatedSkillInstalls } from "./skill/metadata";
import { runLogin } from "./cli/commands/login";
import { runLogout } from "./cli/commands/logout";
import { runConfig } from "./cli/commands/config";
import { runWhoami } from "./cli/commands/whoami";
import { runSearch } from "./cli/commands/search";
import { runGroup } from "./cli/commands/group";
import { runProject } from "./cli/commands/project";
import { runInterface } from "./cli/commands/interface";
import { runLog } from "./cli/commands/log";
import { runDocsSync, runDocsSyncBindings } from "./cli/commands/docs-sync";
import { runSelfUpdate } from "./cli/commands/self-update";
import { runInstallSkillCommand } from "./cli/commands/install-skill";
import { runRequest } from "./cli/commands/request";
import { runCol } from "./cli/commands/col";
import { runExport } from "./cli/commands/export";
import { runEnv } from "./cli/commands/env";
import { runMember } from "./cli/commands/member";
import { runFollow } from "./cli/commands/follow";
import { runUser } from "./cli/commands/user";

// --- converter helpers ---

function toOptions(argv: Record<string, unknown>): Options {
  return {
    config: argv.config as string | undefined,
    baseUrl: (argv.baseUrl || argv["base-url"]) as string | undefined,
    loginUrl: (argv.loginUrl || argv["login-url"]) as string | undefined,
    token: argv.token as string | undefined,
    projectId: (argv.projectId || argv["project-id"]) as string | undefined,
    authMode: (argv.authMode || argv["auth-mode"]) as string | undefined,
    browser: argv.browser as boolean | undefined,
    email: argv.email as string | undefined,
    password: argv.password as string | undefined,
    cookie: argv.cookie as string | undefined,
    tokenParam: (argv.tokenParam || argv["token-param"]) as string | undefined,
    method: argv.method as string | undefined,
    path: argv.path as string | undefined,
    url: argv.url as string | undefined,
    query: argv.query ? (Array.isArray(argv.query) ? argv.query as string[] : [argv.query as string]) : [],
    header: argv.header ? (Array.isArray(argv.header) ? argv.header as string[] : [argv.header as string]) : [],
    data: argv.data as string | undefined,
    dataFile: (argv.dataFile || argv["data-file"]) as string | undefined,
    timeout: argv.timeout as number | undefined,
    id: argv.id as string | undefined,
    name: argv.name as string | undefined,
    desc: argv.desc as string | undefined,
    catId: (argv.catId || argv["cat-id"] || argv.catid) as string | undefined,
    groupId: (argv.groupId || argv["group-id"]) as string | undefined,
    type: argv.type as string | undefined,
    typeId: (argv.typeId || argv["type-id"]) as string | undefined,
    page: argv.page as number | undefined,
    limit: argv.limit as number | string | undefined,
    noUpdate: (argv.noUpdate || argv["no-update"]) as boolean | undefined,
    q: argv.q as string | undefined,
    noPretty: (argv.noPretty || argv["no-pretty"]) as boolean | undefined,
  };
}

function toDocsSyncOptions(argv: Record<string, unknown>): DocsSyncOptions {
  const rawDirs = argv.dir
    ? (Array.isArray(argv.dir) ? argv.dir as string[] : [argv.dir as string])
    : [];
  const positionalDirs = Array.isArray(argv._)
    ? (argv._ as (string | number)[]).map(String).filter((s: string) => s && s !== "docs-sync")
    : [];

  return {
    config: argv.config as string | undefined,
    baseUrl: (argv.baseUrl || argv["base-url"]) as string | undefined,
    token: argv.token as string | undefined,
    projectId: (argv.projectId || argv["project-id"]) as string | undefined,
    authMode: (argv.authMode || argv["auth-mode"]) as string | undefined,
    email: argv.email as string | undefined,
    password: argv.password as string | undefined,
    cookie: argv.cookie as string | undefined,
    tokenParam: (argv.tokenParam || argv["token-param"]) as string | undefined,
    timeout: argv.timeout as number | undefined,
    dirs: rawDirs.length ? rawDirs : positionalDirs,
    bindings: argv.binding ? (Array.isArray(argv.binding) ? argv.binding as string[] : [argv.binding as string]) : [],
    sourceFiles: argv["source-file"]
      ? (Array.isArray(argv["source-file"]) ? argv["source-file"] as string[] : [argv["source-file"] as string])
      : [],
    dryRun: (argv.dryRun || argv["dry-run"]) as boolean | undefined,
    noMermaid: (argv.noMermaid || argv["no-mermaid"]) as boolean | undefined,
    mermaidLook: argv["mermaid-classic"] ? "classic" : "handDrawn",
    mermaidHandDrawnSeed: argv["mermaid-hand-drawn-seed"] as number | undefined,
    force: argv.force as boolean | undefined,
  };
}

function toDocsSyncBindArgs(argv: Record<string, unknown>): DocsSyncBindArgs {
  return {
    name: (argv.name || argv.binding) as string | undefined,
    dir: argv.dir ? (Array.isArray(argv.dir) ? argv.dir[0] as string : argv.dir as string) : undefined,
    projectId: argv["project-id"] !== undefined ? Number(argv["project-id"]) : undefined,
    catId: argv.catid !== undefined ? Number(argv.catid) : (argv["cat-id"] !== undefined ? Number(argv["cat-id"]) : undefined),
    templateId: argv["template-id"] !== undefined ? Number(argv["template-id"]) : undefined,
    sourceFiles: argv["source-file"] ? (Array.isArray(argv["source-file"]) ? argv["source-file"] as string[] : [argv["source-file"] as string]) : [],
    clearSourceFiles: argv["clear-source-files"] as boolean | undefined,
  };
}

// --- update checks ---

async function fetchLatestVersion(timeoutMs: number): Promise<string | null> {
  try {
    const encoded = encodeURIComponent("@leeguoo/yapi-mcp");
    const url = `https://registry.npmjs.org/${encoded}/latest`;
    const response = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
    if (!response.ok) return null;
    const payload = (await response.json()) as { version?: string };
    return typeof payload?.version === "string" ? payload.version : null;
  } catch {
    return null;
  }
}

async function checkForUpdates(options: {
  noUpdate?: boolean;
  skip?: boolean;
}): Promise<void> {
  if (options.skip || options.noUpdate) return;
  if (process.env.YAPI_NO_UPDATE_CHECK === "1") return;
  if (process.env.CI === "1") return;

  const currentVersion = readVersion();
  if (!currentVersion || currentVersion === "unknown") return;

  const cache = readUpdateCache();
  const now = Date.now();
  let latest = cache.latest;
  const shouldCheck =
    !cache.lastChecked || now - cache.lastChecked > UPDATE_CHECK_TTL_MS || !latest;

  if (shouldCheck) {
    const fetched = await fetchLatestVersion(2000);
    if (fetched) {
      latest = fetched;
      cache.latest = fetched;
    }
    cache.lastChecked = now;
  }

  if (!latest || !isNewerVersion(latest, currentVersion)) {
    writeUpdateCache(cache);
    return;
  }

  const shouldNotify =
    cache.lastNotified !== latest || !cache.lastNotifiedAt || now - cache.lastNotifiedAt > UPDATE_CHECK_TTL_MS;
  if (shouldNotify) {
    console.warn(
      `update available: ${currentVersion} -> ${latest}. Run: npm install -g @leeguoo/yapi-mcp@latest`,
    );
    console.warn("or: pnpm add -g @leeguoo/yapi-mcp@latest");
    cache.lastNotified = latest;
    cache.lastNotifiedAt = now;
  }
  writeUpdateCache(cache);
}

function warnIfInstalledSkillsOutdated(options: { skip?: boolean }): void {
  if (options.skip) return;
  const currentVersion = readVersion();
  if (!currentVersion || currentVersion === "unknown") return;
  const outdated = findOutdatedSkillInstalls(currentVersion);
  if (!outdated.length) return;

  const summary = outdated
    .map((item) => `${item.label}@${item.installedVersion || "unknown"}`)
    .join(", ");
  console.warn(
    `skill update available: installed ${summary}, current ${currentVersion}. Run: npx skills add leeguooooo/cross-request-master -y -g`,
  );
}

// --- main ---

export async function main(rawArgs = hideBin(process.argv)): Promise<number> {

  // Pre-parse for update check flags
  const hasHelp = rawArgs.includes("-h") || rawArgs.includes("--help");
  const hasVersion = rawArgs.includes("-V") || rawArgs.includes("--version");
  const hasNoUpdate = rawArgs.includes("--no-update") || rawArgs.includes("--no-update-check");
  const subcommand = rawArgs[0] || "";
  const skipUpdateCheck = hasVersion || hasHelp || hasNoUpdate;

  await checkForUpdates({ noUpdate: hasNoUpdate, skip: skipUpdateCheck });

  const skipSkillWarning =
    skipUpdateCheck ||
    subcommand === "install-skill" ||
    subcommand === "self-update" ||
    process.env.YAPI_NO_SKILL_UPDATE_CHECK === "1";
  warnIfInstalledSkillsOutdated({ skip: skipSkillWarning });

  let commandHandled = false;

  const parser = yargs(rawArgs)
    .scriptName("yapi")
    .version(readVersion())
    .alias("V", "version")
    .help("help")
    .alias("h", "help")
    .strict(false)
    .command(
      "config [action]",
      "Config operations (init)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "init" })
          .option("config", { type: "string", describe: "config file path" })
          .option("base-url", { type: "string", describe: "YApi base URL" })
          .option("auth-mode", { type: "string", describe: "token or global" })
          .option("email", { type: "string", describe: "login email for global mode" })
          .option("password", { type: "string", describe: "login password for global mode" })
          .option("token", { type: "string", describe: "project token" })
          .option("project-id", { type: "string", describe: "default project id" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "init").toLowerCase();
        process.exitCode = await runConfig(action, toOptions(argv));
      },
    )
    .command(
      "login",
      "Login to YApi",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string", describe: "config file path" })
          .option("base-url", { type: "string", describe: "YApi base URL" })
          .option("login-url", { type: "string", describe: "page URL for browser login" })
          .option("browser", { type: "boolean", describe: "force browser login" })
          .option("email", { type: "string", describe: "login email" })
          .option("password", { type: "string", describe: "login password" })
          .option("timeout", { type: "number", describe: "request timeout in ms", default: 30000 })
          .option("token", { type: "string", describe: "project token" })
          .option("project-id", { type: "string", describe: "project id" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runLogin(toOptions(argv));
      },
    )
    .command(
      "logout",
      "Logout from YApi",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string", describe: "config file path" })
          .option("base-url", { type: "string", describe: "YApi base URL" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runLogout(toOptions(argv));
      },
    )
    .command(
      "whoami",
      "Show current user status",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runWhoami(toOptions(argv));
      },
    )
    .command(
      "search",
      "Search YApi projects and interfaces",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("q", { type: "string", describe: "search keyword" })
          .option("timeout", { type: "number", default: 30000 })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runSearch(toOptions(argv));
      },
    )
    .command(
      "group [action]",
      "Group operations (list, get)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "list" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("id", { type: "string", describe: "group id" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "list").toLowerCase();
        process.exitCode = await runGroup(action, toOptions(argv));
      },
    )
    .command(
      "project [action]",
      "Project operations (list, get, token)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "list" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("group-id", { type: "string", describe: "group id for list" })
          .option("id", { type: "string", describe: "project id for get" })
          .option("page", { type: "number" })
          .option("limit", { type: "string" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "list").toLowerCase();
        process.exitCode = await runProject(action, toOptions(argv));
      },
    )
    .command(
      "interface [action] [subaction]",
      "Interface operations (list, list-menu, get, cat add/update/delete)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "" })
          .positional("subaction", { type: "string", default: "" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("id", { type: "string" })
          .option("cat-id", { type: "string" })
          .option("catid", { type: "string" })
          .option("name", { type: "string" })
          .option("desc", { type: "string" })
          .option("page", { type: "number" })
          .option("limit", { type: "string" })
          .option("path", {
            type: "string",
            describe: "(list-menu) filter results by HTTP path substring (case-insensitive)",
          })
          .option("method", {
            type: "string",
            describe: "(list-menu) filter results by HTTP method (case-insensitive exact match)",
          })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "").toLowerCase();
        const subAction = String(argv.subaction || "").toLowerCase();
        const opts = toOptions(argv);
        process.exitCode = await runInterface(action, subAction, opts, opts);
      },
    )
    .command(
      "col [action]",
      "Test collection operations (list, cases, run)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "list" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("id", { type: "string", describe: "collection id" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "list").toLowerCase();
        process.exitCode = await runCol(action, toOptions(argv));
      },
    )
    .command(
      "export",
      "Export project data (json/swagger/html)",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string", describe: "project id (required)" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("type", { type: "string", describe: "export format: json, swagger, html", default: "json" })
          .option("q", { type: "string", describe: "status filter: all, done, undone", default: "all" })
          .option("name", { type: "string", describe: "output file path" })
          .option("id", { type: "string", describe: "project id (alias)" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runExport(toOptions(argv));
      },
    )
    .command(
      "env",
      "Show project environments",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string", describe: "project id (required)" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("id", { type: "string", describe: "project id (alias)" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runEnv(toOptions(argv));
      },
    )
    .command(
      "member [action]",
      "Member management (list, group)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "list" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string", describe: "project id" })
          .option("group-id", { type: "string", describe: "group id" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("id", { type: "string", describe: "resource id" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "list").toLowerCase();
        process.exitCode = await runMember(action, toOptions(argv));
      },
    )
    .command(
      "follow",
      "List followed projects",
      (y: ReturnType<typeof yargs>) =>
        y
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        process.exitCode = await runFollow(toOptions(argv));
      },
    )
    .command(
      "user [action]",
      "User operations (list, search)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "list" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("q", { type: "string", describe: "search keyword" })
          .option("name", { type: "string", describe: "search keyword (alias)" })
          .option("page", { type: "number" })
          .option("limit", { type: "string" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "list").toLowerCase();
        process.exitCode = await runUser(action, toOptions(argv));
      },
    )
    .command(
      "log [action]",
      "Log operations (list)",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("action", { type: "string", default: "list" })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("type", { type: "string", describe: "log type" })
          .option("type-id", { type: "string", describe: "log type id" })
          .option("page", { type: "number" })
          .option("limit", { type: "string" })
          .option("no-pretty", { type: "boolean" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const action = String(argv.action || "list").toLowerCase();
        process.exitCode = await runLog(action, toOptions(argv));
      },
    )
    .command(
      "docs-sync [subcmd] [bindaction]",
      "Sync markdown docs to YApi",
      (y: ReturnType<typeof yargs>) =>
        y
          .positional("subcmd", { type: "string", default: "" })
          .positional("bindaction", {
            type: "string",
            default: "",
            describe: "bind action (list|get|show|add|update|remove)",
          })
          .option("config", { type: "string" })
          .option("base-url", { type: "string" })
          .option("token", { type: "string" })
          .option("project-id", { type: "string" })
          .option("auth-mode", { type: "string" })
          .option("email", { type: "string" })
          .option("password", { type: "string" })
          .option("cookie", { type: "string" })
          .option("token-param", { type: "string", default: "token" })
          .option("timeout", { type: "number", default: 30000 })
          .option("dir", { type: "string", array: true, describe: "docs directory (repeatable)" })
          .option("binding", { type: "string", array: true, describe: "binding name (repeatable)" })
          .option("dry-run", { type: "boolean", describe: "compute but do not update" })
          .option("no-mermaid", { type: "boolean", describe: "do not render mermaid" })
          .option("mermaid-hand-drawn", { type: "boolean", describe: "force hand-drawn look" })
          .option("mermaid-classic", { type: "boolean", describe: "render with classic look" })
          .option("mermaid-hand-drawn-seed", { type: "number", describe: "hand-drawn seed" })
          .option("force", { type: "boolean", describe: "sync all files even if unchanged" })
          // bind-specific options
          .option("name", { type: "string", describe: "binding name (for bind actions)" })
          .option("catid", { type: "string", describe: "YApi category id" })
          .option("cat-id", { type: "string", describe: "YApi category id" })
          .option("template-id", { type: "number", describe: "template interface id" })
          .option("source-file", { type: "string", array: true, describe: "sync specific file(s)" })
          .option("clear-source-files", { type: "boolean", describe: "clear source_files list" }),
      async (argv: Record<string, unknown>) => {
        commandHandled = true;
        const subcmd = String(argv.subcmd || "").toLowerCase();
        if (subcmd === "bind" || subcmd === "bindings") {
          const bindAction = String(argv.bindaction || "list").toLowerCase();
          process.exitCode = await runDocsSyncBindings(bindAction, toDocsSyncBindArgs(argv));
        } else {
          process.exitCode = await runDocsSync(toDocsSyncOptions(argv));
        }
      },
    )
    .command(
      "install-skill",
      "Install a skill",
      (y: ReturnType<typeof yargs>) => y,
      async () => {
        commandHandled = true;
        // Pass remaining args directly
        const idx = process.argv.indexOf("install-skill");
        const remaining = idx >= 0 ? process.argv.slice(idx + 1) : [];
        process.exitCode = await runInstallSkillCommand(remaining);
      },
    )
    .command(
      "self-update",
      "Update yapi CLI to latest version",
      (y: ReturnType<typeof yargs>) => y,
      () => {
        commandHandled = true;
        process.exitCode = runSelfUpdate();
      },
    )
    .option("path", { type: "string", describe: "API path (e.g., /api/interface/get)" })
    .option("url", { type: "string", describe: "full URL (overrides base-url/path)" })
    .option("method", { type: "string", describe: "HTTP method (default: GET)" })
    .option("query", { type: "string", array: true, describe: "query param key=value (repeatable)" })
    .option("header", { type: "string", array: true, describe: "request header Header:Value (repeatable)" })
    .option("data", { type: "string", describe: "request body (JSON or text)" })
    .option("data-file", { type: "string", describe: "request body file" })
    .option("config", { type: "string", describe: "config file path (default: ~/.yapi/config.toml)" })
    .option("base-url", { type: "string", describe: "YApi base URL" })
    .option("token", { type: "string", describe: "project token (supports projectId:token)" })
    .option("project-id", { type: "string", describe: "select token for project" })
    .option("auth-mode", { type: "string", describe: "token or global" })
    .option("email", { type: "string", describe: "login email for global mode" })
    .option("password", { type: "string", describe: "login password for global mode" })
    .option("cookie", { type: "string", describe: "cookie for global mode" })
    .option("token-param", { type: "string", describe: "token query param name", default: "token" })
    .option("timeout", { type: "number", describe: "request timeout in ms", default: 30000 })
    .option("no-update", { type: "boolean", describe: "disable update check", default: false })
    .option("no-pretty", { type: "boolean", describe: "print raw response", default: false })
    .option("id", { type: "string", describe: "resource id" })
    .option("name", { type: "string", describe: "category name" })
    .option("desc", { type: "string", describe: "category description" })
    .option("cat-id", { type: "string", describe: "category id" })
    .option("catid", { type: "string", describe: "category id" })
    .option("group-id", { type: "string", describe: "group id" })
    .option("type", { type: "string", describe: "log type" })
    .option("type-id", { type: "string", describe: "log type id" })
    .option("page", { type: "number", describe: "page number" })
    .option("limit", { type: "string", describe: "page size (number or 'all')" })
    .option("q", { type: "string", describe: "search keyword" })
    .option("login-url", { type: "string", describe: "page URL for browser login" })
    .option("browser", { type: "boolean", describe: "force browser login" });

  const argv = await parser.parse() as Record<string, unknown>;

  if (commandHandled) {
    return (process.exitCode as number) ?? 0;
  }

  // If no subcommand was matched and there's a --path or --url, run direct request
  const opts = toOptions(argv);
  if (opts.path || opts.url) {
    return await runRequest(opts);
  }

  // No command and no --path/--url: show help
  parser.showHelp();
  return 0;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectExecution()) {
  main().then((code) => {
    if (process.exitCode === undefined || process.exitCode === null) {
      process.exitCode = code;
    }
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
