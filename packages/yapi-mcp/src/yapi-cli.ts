#!/usr/bin/env node

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import {
  isD2Available,
  isGraphvizAvailable,
  isMmdcAvailable,
  isPandocAvailable,
  isPlantUmlAvailable,
  extractFirstMarkdownH1Title,
  renderMarkdownToHtml,
} from "./docs/markdown";
import { runInstallSkill } from "./skill/install";
import { YApiAuthService } from "./services/yapi/auth";

type Options = {
  config?: string;
  baseUrl?: string;
  token?: string;
  projectId?: string;
  authMode?: string;
  email?: string;
  password?: string;
  cookie?: string;
  tokenParam?: string;
  method?: string;
  path?: string;
  url?: string;
  query?: string[];
  header?: string[];
  data?: string;
  dataFile?: string;
  timeout?: number;
  q?: string;
  noPretty?: boolean;
  help?: boolean;
  version?: boolean;
};

type DocsSyncOptions = {
  config?: string;
  baseUrl?: string;
  token?: string;
  projectId?: string;
  authMode?: string;
  email?: string;
  password?: string;
  cookie?: string;
  tokenParam?: string;
  timeout?: number;
  dirs: string[];
  bindings: string[];
  dryRun?: boolean;
  noMermaid?: boolean;
  mermaidLook?: "classic" | "handDrawn";
  mermaidHandDrawnSeed?: number;
  d2Sketch?: boolean;
  force?: boolean;
  help?: boolean;
};

type DocsSyncMapping = {
  project_id?: number;
  catid?: number;
  template_id?: number;
  source_files?: string[];
  files?: Record<string, number>;
  file_hashes?: Record<string, string>;
  [key: string]: unknown;
};

type DocsSyncFileInfo = {
  docId: number;
  apiPath: string;
};

type DocsSyncBinding = DocsSyncMapping & {
  dir: string;
};

type DocsSyncConfig = {
  version: number;
  bindings: Record<string, DocsSyncBinding>;
};

type DocsSyncLinkEntry = {
  doc_id: number;
  api_path: string;
  url: string;
};

type DocsSyncLinksBinding = {
  dir: string;
  project_id?: number;
  catid?: number;
  files: Record<string, DocsSyncLinkEntry>;
};

type DocsSyncLinksConfig = {
  version: number;
  bindings: Record<string, DocsSyncLinksBinding>;
};

type DocsSyncProjectEnv = {
  name: string;
  domain: string;
};

type DocsSyncProjectInfo = {
  project_id: number;
  name?: string;
  basepath?: string;
  envs?: DocsSyncProjectEnv[];
  base_url?: string;
};

type DocsSyncProjectsConfig = {
  version: number;
  projects: Record<string, DocsSyncProjectInfo>;
};

type DocsSyncDeploymentEntry = {
  api_path: string;
  env_urls: Record<string, string>;
};

type DocsSyncDeploymentBinding = {
  dir: string;
  project_id?: number;
  files: Record<string, DocsSyncDeploymentEntry>;
};

type DocsSyncDeploymentsConfig = {
  version: number;
  bindings: Record<string, DocsSyncDeploymentBinding>;
};

type DocsSyncBindArgs = {
  name?: string;
  dir?: string;
  projectId?: number;
  catId?: number;
  templateId?: number;
  sourceFiles?: string[];
  clearSourceFiles?: boolean;
  help?: boolean;
};

type ConfigInitOptions = Pick<Options, "baseUrl" | "email" | "password" | "token" | "projectId">;

function parseKeyValue(raw: string): [string, string] {
  if (!raw || !raw.includes("=")) throw new Error("expected key=value");
  const idx = raw.indexOf("=");
  return [raw.slice(0, idx), raw.slice(idx + 1)];
}

function parseHeader(raw: string): [string, string] {
  if (!raw || !raw.includes(":")) throw new Error("expected Header:Value");
  const idx = raw.indexOf(":");
  return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
}

function parseJsonMaybe(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getPayloadMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const message = record.errmsg ?? record.message ?? record.msg;
  return typeof message === "string" ? message : "";
}

function getPayloadErrcode(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const code = Number(record.errcode ?? record.code ?? record.errCode);
  return Number.isFinite(code) ? code : null;
}

function looksLikeAuthError(status: number, payload: unknown): boolean {
  if (status === 401 || status === 403) return true;
  const code = getPayloadErrcode(payload);
  if (code !== null && [40011, 40012, 40013, 401, 403].includes(code)) return true;
  const message = getPayloadMessage(payload);
  if (!message) return false;
  return /登录|login|权限|unauthori|forbidden|not\s*login|no\s*permission/i.test(message);
}

function joinUrl(baseUrl: string, endpoint: string): string {
  if (!baseUrl) return endpoint;
  if (baseUrl.endsWith("/") && endpoint.startsWith("/")) return baseUrl.slice(0, -1) + endpoint;
  if (!baseUrl.endsWith("/") && !endpoint.startsWith("/")) return baseUrl + "/" + endpoint;
  return baseUrl + endpoint;
}

function globalConfigPath(): string {
  const yapiHome = process.env.YAPI_HOME || path.join(os.homedir(), ".yapi");
  return path.join(yapiHome, "config.toml");
}

function parseSimpleToml(text: string): Record<string, string> {
  const data: Record<string, string> = {};
  const lines = String(text || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.split("#", 1)[0].split(";", 1)[0].trim();
    if (!line || line.startsWith("[")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

function resolveToken(tokenValue: string, projectId: string): string {
  if (!tokenValue) return "";
  if (tokenValue.includes(",") || tokenValue.includes(":")) {
    let defaultToken = "";
    const mapping: Record<string, string> = {};
    tokenValue.split(",").forEach((rawPair) => {
      const pair = rawPair.trim();
      if (!pair) return;
      const idx = pair.indexOf(":");
      if (idx === -1) {
        defaultToken = pair;
        return;
      }
      const pid = pair.slice(0, idx).trim();
      const token = pair.slice(idx + 1).trim();
      if (pid && token) mapping[pid] = token;
    });
    if (projectId && mapping[projectId]) return mapping[projectId];
    if (defaultToken) return defaultToken;
    const keys = Object.keys(mapping);
    if (keys.length) return mapping[keys[0]];
  }
  return tokenValue;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(
  baseUrl: string | null,
  endpoint: string,
  queryItems: [string, string][],
  token: string,
  tokenParam: string,
): string {
  const url = baseUrl ? joinUrl(baseUrl, endpoint) : endpoint;
  const parsed = new URL(url);
  for (const [key, value] of queryItems) {
    if (key) parsed.searchParams.append(key, value ?? "");
  }
  if (token && !parsed.searchParams.has(tokenParam)) {
    parsed.searchParams.append(tokenParam, token);
  }
  return parsed.toString();
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    query: [],
    header: [],
    method: "GET",
    tokenParam: "token",
    timeout: 30000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-V" || arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg === "--config") {
      options.config = argv[++i];
      continue;
    }
    if (arg.startsWith("--config=")) {
      options.config = arg.slice(9);
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice(11);
      continue;
    }
    if (arg === "--token") {
      options.token = argv[++i];
      continue;
    }
    if (arg.startsWith("--token=")) {
      options.token = arg.slice(8);
      continue;
    }
    if (arg === "--project-id") {
      options.projectId = argv[++i];
      continue;
    }
    if (arg.startsWith("--project-id=")) {
      options.projectId = arg.slice(13);
      continue;
    }
    if (arg === "--auth-mode") {
      options.authMode = argv[++i];
      continue;
    }
    if (arg.startsWith("--auth-mode=")) {
      options.authMode = arg.slice(12);
      continue;
    }
    if (arg === "--email") {
      options.email = argv[++i];
      continue;
    }
    if (arg.startsWith("--email=")) {
      options.email = arg.slice(8);
      continue;
    }
    if (arg === "--password") {
      options.password = argv[++i];
      continue;
    }
    if (arg.startsWith("--password=")) {
      options.password = arg.slice(11);
      continue;
    }
    if (arg === "--cookie") {
      options.cookie = argv[++i];
      continue;
    }
    if (arg.startsWith("--cookie=")) {
      options.cookie = arg.slice(9);
      continue;
    }
    if (arg === "--token-param") {
      options.tokenParam = argv[++i];
      continue;
    }
    if (arg.startsWith("--token-param=")) {
      options.tokenParam = arg.slice(14);
      continue;
    }
    if (arg === "--method") {
      options.method = argv[++i];
      continue;
    }
    if (arg.startsWith("--method=")) {
      options.method = arg.slice(9);
      continue;
    }
    if (arg === "--path") {
      options.path = argv[++i];
      continue;
    }
    if (arg.startsWith("--path=")) {
      options.path = arg.slice(7);
      continue;
    }
    if (arg === "--url") {
      options.url = argv[++i];
      continue;
    }
    if (arg.startsWith("--url=")) {
      options.url = arg.slice(6);
      continue;
    }
    if (arg === "--query") {
      options.query?.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--query=")) {
      options.query?.push(arg.slice(8));
      continue;
    }
    if (arg === "--q" || arg === "-q") {
      options.q = argv[++i];
      continue;
    }
    if (arg.startsWith("--q=")) {
      options.q = arg.slice(4);
      continue;
    }
    if (arg === "--header") {
      options.header?.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--header=")) {
      options.header?.push(arg.slice(9));
      continue;
    }
    if (arg === "--data") {
      options.data = argv[++i];
      continue;
    }
    if (arg.startsWith("--data=")) {
      options.data = arg.slice(7);
      continue;
    }
    if (arg === "--data-file") {
      options.dataFile = argv[++i];
      continue;
    }
    if (arg.startsWith("--data-file=")) {
      options.dataFile = arg.slice(12);
      continue;
    }
    if (arg === "--timeout") {
      options.timeout = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--timeout=")) {
      options.timeout = Number(arg.slice(10));
      continue;
    }
    if (arg === "--no-pretty") {
      options.noPretty = true;
      continue;
    }
  }
  return options;
}

function parseDocsSyncArgs(argv: string[]): DocsSyncOptions {
  const options: DocsSyncOptions = {
    dirs: [],
    bindings: [],
    tokenParam: "token",
    timeout: 30000,
    mermaidLook: "handDrawn",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--config") {
      options.config = argv[++i];
      continue;
    }
    if (arg.startsWith("--config=")) {
      options.config = arg.slice(9);
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice(11);
      continue;
    }
    if (arg === "--token") {
      options.token = argv[++i];
      continue;
    }
    if (arg.startsWith("--token=")) {
      options.token = arg.slice(8);
      continue;
    }
    if (arg === "--project-id") {
      options.projectId = argv[++i];
      continue;
    }
    if (arg.startsWith("--project-id=")) {
      options.projectId = arg.slice(13);
      continue;
    }
    if (arg === "--auth-mode") {
      options.authMode = argv[++i];
      continue;
    }
    if (arg.startsWith("--auth-mode=")) {
      options.authMode = arg.slice(12);
      continue;
    }
    if (arg === "--email") {
      options.email = argv[++i];
      continue;
    }
    if (arg.startsWith("--email=")) {
      options.email = arg.slice(8);
      continue;
    }
    if (arg === "--password") {
      options.password = argv[++i];
      continue;
    }
    if (arg.startsWith("--password=")) {
      options.password = arg.slice(11);
      continue;
    }
    if (arg === "--cookie") {
      options.cookie = argv[++i];
      continue;
    }
    if (arg.startsWith("--cookie=")) {
      options.cookie = arg.slice(9);
      continue;
    }
    if (arg === "--token-param") {
      options.tokenParam = argv[++i];
      continue;
    }
    if (arg.startsWith("--token-param=")) {
      options.tokenParam = arg.slice(14);
      continue;
    }
    if (arg === "--timeout") {
      options.timeout = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--timeout=")) {
      options.timeout = Number(arg.slice(10));
      continue;
    }
    if (arg === "--dir") {
      options.dirs.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--dir=")) {
      options.dirs.push(arg.slice(6));
      continue;
    }
    if (arg === "--binding") {
      options.bindings.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--binding=")) {
      options.bindings.push(arg.slice(10));
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-mermaid") {
      options.noMermaid = true;
      continue;
    }
    if (arg === "--mermaid-hand-drawn") {
      options.mermaidLook = "handDrawn";
      continue;
    }
    if (arg === "--mermaid-classic") {
      options.mermaidLook = "classic";
      options.mermaidHandDrawnSeed = undefined;
      continue;
    }
    if (arg === "--mermaid-hand-drawn-seed") {
      const seed = Number(argv[++i]);
      if (Number.isFinite(seed)) {
        options.mermaidHandDrawnSeed = seed;
      }
      if (!options.mermaidLook) options.mermaidLook = "handDrawn";
      continue;
    }
    if (arg.startsWith("--mermaid-hand-drawn-seed=")) {
      const seed = Number(arg.slice(27));
      if (Number.isFinite(seed)) {
        options.mermaidHandDrawnSeed = seed;
      }
      if (!options.mermaidLook) options.mermaidLook = "handDrawn";
      continue;
    }
    if (arg === "--d2-sketch") {
      options.d2Sketch = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg.startsWith("-")) continue;
    options.dirs.push(arg);
  }
  return options;
}

function parseDocsSyncBindArgs(argv: string[]): DocsSyncBindArgs {
  const options: DocsSyncBindArgs = {
    sourceFiles: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--name" || arg === "--binding") {
      options.name = argv[++i];
      continue;
    }
    if (arg.startsWith("--name=")) {
      options.name = arg.slice(7);
      continue;
    }
    if (arg.startsWith("--binding=")) {
      options.name = arg.slice(10);
      continue;
    }
    if (arg === "--dir") {
      options.dir = argv[++i];
      continue;
    }
    if (arg.startsWith("--dir=")) {
      options.dir = arg.slice(6);
      continue;
    }
    if (arg === "--project-id") {
      options.projectId = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--project-id=")) {
      options.projectId = Number(arg.slice(13));
      continue;
    }
    if (arg === "--catid" || arg === "--cat-id") {
      options.catId = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--catid=")) {
      options.catId = Number(arg.slice(8));
      continue;
    }
    if (arg.startsWith("--cat-id=")) {
      options.catId = Number(arg.slice(9));
      continue;
    }
    if (arg === "--template-id") {
      options.templateId = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--template-id=")) {
      options.templateId = Number(arg.slice(14));
      continue;
    }
    if (arg === "--source-file") {
      options.sourceFiles?.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--source-file=")) {
      options.sourceFiles?.push(arg.slice(14));
      continue;
    }
    if (arg === "--clear-source-files") {
      options.clearSourceFiles = true;
      continue;
    }
  }
  return options;
}

function usage(): string {
  return [
    "Usage:",
    "  yapi --path /api/interface/get --query id=123",
    "  yapi docs-sync [options] [dir...]",
    "  yapi docs-sync bind <action> [options]",
    "  yapi login [options]",
    "  yapi whoami [options]",
    "  yapi search [options]",
    "  yapi install-skill [options]",
    "Options:",
    "  --config <path>        config file path (default: ~/.yapi/config.toml)",
    "  --base-url <url>       YApi base URL",
    "  --token <token>        project token (supports projectId:token)",
    "  --project-id <id>      select token for project",
    "  --auth-mode <mode>     token or global",
    "  --email <email>        login email for global mode",
    "  --password <pwd>       login password for global mode",
    "  --cookie <cookie>      cookie for global mode",
    "  --q <keyword>          search keyword (for yapi search)",
    "  --path <path>          API path (e.g., /api/interface/get)",
    "  --url <url>            full URL (overrides base-url/path)",
    "  --query key=value      query param (repeatable)",
    "  --header Header:Value  request header (repeatable)",
    "  --method <method>      HTTP method",
    "  --data <payload>       request body (JSON or text)",
    "  --data-file <file>     request body file",
    "  --timeout <ms>         request timeout in ms",
    "  --no-pretty            print raw response",
    "Docs-sync options:",
    "  --dir <path>           docs directory (repeatable; default: docs/release-notes)",
    "  --binding <name>       use binding from .yapi/docs-sync.json (repeatable)",
    "  --dry-run              compute but do not update YApi or mapping files",
    "  --no-mermaid           do not render mermaid code blocks",
    "  --mermaid-hand-drawn   force mermaid hand-drawn look (default)",
    "  --mermaid-classic      render mermaid with classic look",
    "  --mermaid-hand-drawn-seed <n>  hand-drawn seed (implies hand-drawn look)",
    "  --d2-sketch            render D2 diagrams in sketch style",
    "  --force                sync all files even if unchanged",
    "Docs-sync bind actions:",
    "  list, get, add, update, remove",
    "  -V, --version          print version",
    "  -h, --help             show help",
  ].join("\n");
}

function docsSyncUsage(): string {
  return [
    "Usage:",
    "  yapi docs-sync [options] [dir...]",
    "  yapi docs-sync bind <action> [options]",
    "Options:",
    "  --config <path>        config file path (default: ~/.yapi/config.toml)",
    "  --base-url <url>       YApi base URL",
    "  --token <token>        project token (supports projectId:token)",
    "  --project-id <id>      select token for project",
    "  --auth-mode <mode>     token or global",
    "  --email <email>        login email for global mode",
    "  --password <pwd>       login password for global mode",
    "  --cookie <cookie>      cookie for global mode",
    "  --token-param <name>   token query param name (default: token)",
    "  --timeout <ms>         request timeout in ms",
    "  --dir <path>           docs directory (repeatable; default: docs/release-notes)",
    "  --binding <name>       use binding from .yapi/docs-sync.json (repeatable)",
    "  --dry-run              compute but do not update YApi or mapping files",
    "  --no-mermaid           do not render mermaid code blocks",
    "  --mermaid-hand-drawn   force mermaid hand-drawn look (default)",
    "  --mermaid-classic      render mermaid with classic look",
    "  --mermaid-hand-drawn-seed <n>  hand-drawn seed (implies hand-drawn look)",
    "  --d2-sketch            render D2 diagrams in sketch style",
    "  --force                sync all files even if unchanged",
    "  -h, --help             show help",
  ].join("\n");
}

function docsSyncBindUsage(): string {
  return [
    "Usage:",
    "  yapi docs-sync bind list",
    "  yapi docs-sync bind get --name <binding>",
    "  yapi docs-sync bind add --name <binding> --dir <path> --project-id <id> --catid <id> [options]",
    "  yapi docs-sync bind update --name <binding> [options]",
    "  yapi docs-sync bind remove --name <binding>",
    "Options:",
    "  --name <binding>       binding name (alias: --binding)",
    "  --dir <path>           docs directory path",
    "  --project-id <id>      YApi project id",
    "  --catid <id>           YApi category id",
    "  --template-id <id>     template interface id",
    "  --source-file <path>   sync specific file(s) (repeatable)",
    "  --clear-source-files   clear source_files list",
    "  -h, --help             show help",
  ].join("\n");
}

function loginUsage(): string {
  return [
    "Usage:",
    "  yapi login [options]",
    "Options:",
    "  --config <path>        config file path (default: ~/.yapi/config.toml)",
    "  --base-url <url>       YApi base URL",
    "  --email <email>        login email for global mode",
    "  --password <pwd>       login password for global mode",
    "  --timeout <ms>         request timeout in ms",
    "  -h, --help             show help",
  ].join("\n");
}

function whoamiUsage(): string {
  return [
    "Usage:",
    "  yapi whoami [options]",
    "Options:",
    "  --config <path>        config file path (default: ~/.yapi/config.toml)",
    "  --base-url <url>       YApi base URL",
    "  --token <token>        project token (supports projectId:token)",
    "  --project-id <id>      select token for project",
    "  --auth-mode <mode>     token or global",
    "  --email <email>        login email for global mode",
    "  --password <pwd>       login password for global mode",
    "  --cookie <cookie>      cookie for global mode",
    "  --token-param <name>   token query param name (default: token)",
    "  --timeout <ms>         request timeout in ms",
    "  --no-pretty            print raw response",
    "  -h, --help             show help",
  ].join("\n");
}

function searchUsage(): string {
  return [
    "Usage:",
    "  yapi search --q <keyword>",
    "Options:",
    "  --config <path>        config file path (default: ~/.yapi/config.toml)",
    "  --base-url <url>       YApi base URL",
    "  --token <token>        project token (supports projectId:token)",
    "  --project-id <id>      select token for project",
    "  --auth-mode <mode>     token or global",
    "  --email <email>        login email for global mode",
    "  --password <pwd>       login password for global mode",
    "  --cookie <cookie>      cookie for global mode",
    "  --token-param <name>   token query param name (default: token)",
    "  --q <keyword>          search keyword",
    "  --timeout <ms>         request timeout in ms",
    "  --no-pretty            print raw response",
    "  -h, --help             show help",
  ].join("\n");
}

function escapeTomlValue(value: string): string {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function formatToml(config: Record<string, string>): string {
  const orderedKeys = ["base_url", "auth_mode", "email", "password", "token", "project_id"];
  const lines = ["# YApi CLI config"];
  for (const key of orderedKeys) {
    const value = config[key] || "";
    lines.push(`${key} = "${escapeTomlValue(value)}"`);
  }
  return `${lines.join("\n")}\n`;
}

function writeConfig(filePath: string, config: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, formatToml(config), "utf8");
}

function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const originalWrite = (rl as unknown as { _writeToOutput?: (value: string) => void })
    ._writeToOutput;
  (rl as unknown as { stdoutMuted?: boolean }).stdoutMuted = true;
  (rl as unknown as { _writeToOutput?: (value: string) => void })._writeToOutput =
    function writeToOutput(value: string) {
      if ((rl as unknown as { stdoutMuted?: boolean }).stdoutMuted) return;
      if (typeof originalWrite === "function") {
        originalWrite.call(this, value);
      } else {
        (rl as unknown as { output: NodeJS.WritableStream }).output.write(value);
      }
    };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      (rl as unknown as { stdoutMuted?: boolean }).stdoutMuted = false;
      rl.close();
      resolve(answer);
    });
  });
}

async function promptRequired(question: string, hidden: boolean): Promise<string> {
  while (true) {
    const answer = hidden ? await promptHidden(question) : await promptText(question);
    const trimmed = String(answer || "").trim();
    if (trimmed) return trimmed;
  }
}

async function initConfigIfMissing(
  options: ConfigInitOptions,
): Promise<{ configPath: string; config: Record<string, string> } | null> {
  const hasBaseUrl = Boolean(options.baseUrl);
  const hasEmail = Boolean(options.email);
  const hasPassword = Boolean(options.password);
  if (!hasBaseUrl || !hasEmail || !hasPassword) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return null;
  }
  const baseUrl = hasBaseUrl ? options.baseUrl : await promptRequired("YApi base URL: ", false);
  const email = hasEmail ? options.email : await promptRequired("YApi email: ", false);
  const password = hasPassword ? options.password : await promptRequired("YApi password: ", true);
  const config: Record<string, string> = {
    base_url: baseUrl || "",
    auth_mode: "global",
    email: email || "",
    password: password || "",
    token: options.token || "",
    project_id: options.projectId || "",
  };
  const configPath = globalConfigPath();
  writeConfig(configPath, config);
  return { configPath, config };
}

function readVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

type SimpleRequestResult = {
  ok: boolean;
  queryItems?: [string, string][];
};

type SimpleRequestQueryBuilder = (options: Options) => SimpleRequestResult;

async function runSimpleRequest(
  rawArgs: string[],
  usageFn: () => string,
  endpoint: string,
  requireBaseUrl: boolean,
  buildQueryItems?: SimpleRequestQueryBuilder,
): Promise<number> {
  const options = parseArgs(rawArgs);
  if (options.help) {
    console.log(usageFn());
    return 0;
  }
  if (options.version) {
    console.log(readVersion());
    return 0;
  }

  const configPath = options.config || globalConfigPath();
  const config = fs.existsSync(configPath)
    ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
    : {};

  const baseUrl = options.baseUrl || config.base_url || "";
  if (requireBaseUrl && !baseUrl) {
    console.error("missing --base-url or config base_url");
    return 2;
  }

  const projectId = options.projectId || config.project_id || "";
  const rawToken = options.token || config.token || "";
  const token = resolveToken(rawToken, projectId);

  let authMode = (options.authMode || config.auth_mode || "").trim().toLowerCase();
  if (!authMode) {
    authMode = token
      ? "token"
      : options.email || options.password || config.email || config.password
        ? "global"
        : "token";
  }
  if (authMode !== "token" && authMode !== "global") {
    console.error("invalid --auth-mode (use token or global)");
    return 2;
  }

  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  const email = options.email || config.email || "";
  const password = options.password || config.password || "";
  const authService =
    authMode === "global"
      ? new YApiAuthService(baseUrl, email || "", password || "", "warn", {
          timeoutMs: options.timeout || 30000,
        })
      : null;
  const canRelogin =
    authMode === "global" &&
    Boolean(authService) &&
    Boolean(email) &&
    Boolean(password) &&
    !options.cookie;

  if (!headers.Cookie && authMode === "global") {
    const cachedCookie = authService?.getCachedCookieHeader();
    if (cachedCookie) {
      headers.Cookie = cachedCookie;
    } else if (email && password && authService) {
      try {
        headers.Cookie = await authService.getCookieHeaderWithLogin();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 2;
      }
    } else {
      console.error("missing email/password for global auth");
      return 2;
    }
  }

  let queryItems: [string, string][] = [];
  if (buildQueryItems) {
    const result = buildQueryItems(options);
    if (!result.ok) return 2;
    queryItems = result.queryItems || [];
  }

  const url = buildUrl(
    baseUrl,
    endpoint,
    queryItems,
    authMode === "token" ? token : "",
    options.tokenParam || "token",
  );

  const sendOnce = async () => {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers,
      },
      options.timeout || 30000,
    );
    const text = await response.text();
    return { response, text, json: parseJsonMaybe(text) };
  };

  let result: { response: Response; text: string; json: unknown | null };
  try {
    result = await sendOnce();
  } catch (error) {
    console.error("request failed: " + (error instanceof Error ? error.message : String(error)));
    return 2;
  }

  if (canRelogin && looksLikeAuthError(result.response.status, result.json)) {
    try {
      headers.Cookie = await authService!.getCookieHeaderWithLogin({ forceLogin: true });
      result = await sendOnce();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  const { text } = result;
  if (options.noPretty) {
    console.log(text);
    return 0;
  }
  try {
    const payload = result.json ?? JSON.parse(text);
    console.log(JSON.stringify(payload, null, 2));
  } catch {
    console.log(text);
  }
  return 0;
}

async function runLogin(rawArgs: string[]): Promise<number> {
  const options = parseArgs(rawArgs);
  if (options.help) {
    console.log(loginUsage());
    return 0;
  }
  if (options.version) {
    console.log(readVersion());
    return 0;
  }

  const configPath = options.config || globalConfigPath();
  const config = fs.existsSync(configPath)
    ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
    : {};

  let baseUrl = options.baseUrl || config.base_url || "";
  let email = options.email || config.email || "";
  let password = options.password || config.password || "";
  let updated = false;

  if (!baseUrl) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("missing --base-url or config base_url");
      return 2;
    }
    baseUrl = await promptRequired("YApi base URL: ", false);
    updated = true;
  }
  if (!email) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("missing --email or config email");
      return 2;
    }
    email = await promptRequired("YApi email: ", false);
    updated = true;
  }
  if (!password) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("missing --password or config password");
      return 2;
    }
    password = await promptRequired("YApi password: ", true);
    updated = true;
  }

  const shouldWriteConfig = updated || !fs.existsSync(configPath) || config.auth_mode !== "global";
  if (shouldWriteConfig) {
    const mergedConfig: Record<string, string> = {
      base_url: baseUrl,
      auth_mode: "global",
      email,
      password,
      token: options.token || config.token || "",
      project_id: options.projectId || config.project_id || "",
    };
    writeConfig(configPath, mergedConfig);
  }

  try {
    const authService = new YApiAuthService(baseUrl, email, password, "warn", {
      timeoutMs: options.timeout || 30000,
    });
    await authService.getCookieHeaderWithLogin({ forceLogin: true });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  console.log("login success (cookie cached in ~/.yapi-mcp/auth-*.json)");
  return 0;
}

async function runWhoami(rawArgs: string[]): Promise<number> {
  return await runSimpleRequest(rawArgs, whoamiUsage, "/api/user/status", true);
}

async function runSearch(rawArgs: string[]): Promise<number> {
  return await runSimpleRequest(rawArgs, searchUsage, "/api/project/search", true, (options) => {
    const keyword = String(options.q || "").trim();
    if (!keyword) {
      console.error("missing --q for search");
      return { ok: false };
    }
    return { ok: true, queryItems: [["q", keyword]] };
  });
}

function findDocsSyncHome(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, ".yapi");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveDocsSyncHome(startDir: string, ensure: boolean): string | null {
  const found = findDocsSyncHome(startDir);
  if (found) return found;
  if (!ensure) return null;
  const home = path.join(path.resolve(startDir), ".yapi");
  fs.mkdirSync(home, { recursive: true });
  ensureDocsSyncReadme(home);
  return home;
}

function docsSyncConfigPath(homeDir: string): string {
  return path.join(homeDir, "docs-sync.json");
}

function docsSyncLinksPath(homeDir: string): string {
  return path.join(homeDir, "docs-sync.links.json");
}

function docsSyncProjectsPath(homeDir: string): string {
  return path.join(homeDir, "docs-sync.projects.json");
}

function docsSyncDeploymentsPath(homeDir: string): string {
  return path.join(homeDir, "docs-sync.deployments.json");
}

const DOCS_SYNC_README = [
  "# YApi Docs Sync",
  "",
  "This folder is generated by the yapi docs-sync tool.",
  "Extra caches are written when running docs-sync with bindings.",
  "",
  "Project: https://github.com/leeguooooo/cross-request-master",
  "",
  "Files:",
  "- docs-sync.json: bindings and file-to-doc ID mapping.",
  "- docs-sync.links.json: local docs to YApi doc URLs.",
  "- docs-sync.projects.json: cached project metadata/envs.",
  "- docs-sync.deployments.json: local docs to deployed URLs.",
].join("\n");

function ensureDocsSyncReadme(homeDir: string): void {
  const readmePath = path.join(homeDir, "README.md");
  if (fs.existsSync(readmePath)) return;
  fs.writeFileSync(readmePath, `${DOCS_SYNC_README}\n`, "utf8");
}

function loadDocsSyncConfig(homeDir: string): DocsSyncConfig {
  const configPath = docsSyncConfigPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return { version: 1, bindings: {} };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<DocsSyncConfig>;
  const bindings = parsed.bindings && typeof parsed.bindings === "object" ? parsed.bindings : {};
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    bindings: bindings as Record<string, DocsSyncBinding>,
  };
}

function saveDocsSyncConfig(homeDir: string, config: DocsSyncConfig): void {
  const configPath = docsSyncConfigPath(homeDir);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function loadDocsSyncLinks(homeDir: string): DocsSyncLinksConfig {
  const configPath = docsSyncLinksPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return { version: 1, bindings: {} };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<DocsSyncLinksConfig>;
  const bindings = parsed.bindings && typeof parsed.bindings === "object" ? parsed.bindings : {};
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    bindings: bindings as Record<string, DocsSyncLinksBinding>,
  };
}

function saveDocsSyncLinks(homeDir: string, config: DocsSyncLinksConfig): void {
  const configPath = docsSyncLinksPath(homeDir);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function loadDocsSyncProjects(homeDir: string): DocsSyncProjectsConfig {
  const configPath = docsSyncProjectsPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return { version: 1, projects: {} };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<DocsSyncProjectsConfig>;
  const projects = parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {};
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    projects: projects as Record<string, DocsSyncProjectInfo>,
  };
}

function saveDocsSyncProjects(homeDir: string, config: DocsSyncProjectsConfig): void {
  const configPath = docsSyncProjectsPath(homeDir);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function loadDocsSyncDeployments(homeDir: string): DocsSyncDeploymentsConfig {
  const configPath = docsSyncDeploymentsPath(homeDir);
  if (!fs.existsSync(configPath)) {
    return { version: 1, bindings: {} };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<DocsSyncDeploymentsConfig>;
  const bindings = parsed.bindings && typeof parsed.bindings === "object" ? parsed.bindings : {};
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    bindings: bindings as Record<string, DocsSyncDeploymentBinding>,
  };
}

function saveDocsSyncDeployments(homeDir: string, config: DocsSyncDeploymentsConfig): void {
  const configPath = docsSyncDeploymentsPath(homeDir);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function resolveBindingDir(rootDir: string, bindingDir: string): string {
  if (!bindingDir) return rootDir;
  return path.isAbsolute(bindingDir) ? bindingDir : path.resolve(rootDir, bindingDir);
}

function normalizeBindingDir(rootDir: string, bindingDir: string): string {
  const resolved = resolveBindingDir(rootDir, bindingDir);
  const relative = path.relative(rootDir, resolved);
  if (!relative || relative === ".") return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return resolved;
  return relative;
}

function loadMapping(dirPath: string): { mapping: DocsSyncMapping; mappingPath: string } {
  const mappingPath = path.join(dirPath, ".yapi.json");
  if (!fs.existsSync(mappingPath)) {
    return { mapping: {}, mappingPath };
  }
  const raw = fs.readFileSync(mappingPath, "utf8");
  const mapping = JSON.parse(raw) as DocsSyncMapping;
  return { mapping, mappingPath };
}

function saveMapping(mapping: DocsSyncMapping, mappingPath: string): void {
  fs.writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
}

function buildDocsSyncHash(markdown: string, options: DocsSyncOptions): string {
  const hash = crypto.createHash("sha1");
  hash.update(options.noMermaid ? "no-mermaid\n" : "mermaid\n");
  if (!options.noMermaid) {
    if (options.mermaidLook) {
      hash.update(`mermaid-look:${options.mermaidLook}\n`);
    }
    if (Number.isFinite(options.mermaidHandDrawnSeed ?? NaN)) {
      hash.update(`mermaid-seed:${options.mermaidHandDrawnSeed}\n`);
    }
  }
  if (options.d2Sketch) {
    hash.update("d2-sketch\n");
  }
  hash.update(markdown);
  return hash.digest("hex");
}

function resolveSourceFiles(dirPath: string, mapping: DocsSyncMapping): string[] {
  const sources = Array.isArray(mapping.source_files) ? mapping.source_files : [];
  if (!sources.length) {
    return fs
      .readdirSync(dirPath)
      .filter((name) => name.endsWith(".md") && name !== "README.md")
      .map((name) => path.join(dirPath, name))
      .sort((a, b) => a.localeCompare(b));
  }
  return sources.map((source) => {
    const resolved = path.isAbsolute(source) ? source : path.resolve(dirPath, source);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`source file not found: ${resolved}`);
    }
    return resolved;
  });
}

function normalizeUiBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
}

function buildInterfaceWebUrl(
  baseUrl: string,
  projectId: number | string,
  apiId: number | string,
): string {
  const base = normalizeUiBaseUrl(baseUrl);
  const pid = encodeURIComponent(String(projectId ?? ""));
  const aid = encodeURIComponent(String(apiId ?? ""));
  if (!base || !pid || !aid) return "";
  return `${base}/project/${pid}/interface/api/${aid}`;
}

function normalizePathSegment(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  const noTrailing = trimmed.replace(/\/+$/, "");
  return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
}

function buildEnvUrl(domain: string, basepath: string, apiPath: string): string {
  const base = String(domain || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return "";
  const normalizedBasepath = normalizePathSegment(basepath);
  const normalizedPath = normalizePathSegment(apiPath);
  return `${base}${normalizedBasepath}${normalizedPath}`;
}

function normalizeProjectEnvs(raw: unknown): DocsSyncProjectEnv[] {
  if (!Array.isArray(raw)) return [];
  const result: DocsSyncProjectEnv[] = [];
  raw.forEach((item) => {
    const name =
      item && typeof item === "object" && "name" in item
        ? String((item as any).name || "").trim()
        : "";
    const domain =
      item && typeof item === "object" && "domain" in item
        ? String((item as any).domain || "").trim()
        : "";
    if (!domain) return;
    result.push({ name: name || domain, domain });
  });
  return result;
}

type YapiRequest = (
  endpoint: string,
  method: "GET" | "POST",
  query?: Record<string, unknown>,
  data?: unknown,
) => Promise<any>;

async function fetchProjectInfo(
  projectId: number,
  baseUrl: string,
  request: YapiRequest,
): Promise<DocsSyncProjectInfo | null> {
  if (!projectId) return null;
  const resp = await request("/api/project/get", "GET", { id: projectId });
  if (resp?.errcode !== 0) {
    throw new Error(`project get failed: ${resp?.errmsg || "unknown error"}`);
  }
  const data = resp?.data || {};
  const name = typeof data.name === "string" ? data.name : "";
  const basepath = typeof data.basepath === "string" ? data.basepath : "";
  const envs = normalizeProjectEnvs(data.env || data.envs);
  return {
    project_id: Number(projectId),
    name,
    basepath,
    envs,
    base_url: baseUrl,
  };
}

async function listExistingInterfaces(
  catId: number,
  request: YapiRequest,
): Promise<{
  byPath: Record<string, number>;
  byTitle: Record<string, number>;
  byId: Record<string, { path?: string; title?: string }>;
}> {
  const resp = await request("/api/interface/list_cat", "GET", {
    catid: catId,
    page: 1,
    limit: 10000,
  });
  if (resp?.errcode !== 0) {
    throw new Error(`list_cat failed: ${resp?.errmsg || "unknown error"}`);
  }
  const items = resp?.data?.list || [];
  const byPath: Record<string, number> = {};
  const byTitle: Record<string, number> = {};
  const byId: Record<string, { path?: string; title?: string }> = {};
  for (const item of items) {
    const apiPath = item?.path;
    const title = item?.title;
    const itemId = item?._id;
    if (apiPath && itemId) byPath[apiPath] = Number(itemId);
    if (title && itemId) byTitle[title] = Number(itemId);
    if (itemId) {
      byId[String(itemId)] = { path: apiPath || "", title: title || "" };
    }
  }
  return { byPath, byTitle, byId };
}

function buildAddPayload(
  template: Record<string, any>,
  title: string,
  apiPath: string,
  catId: number,
  projectId: number,
): Record<string, any> {
  return {
    title,
    path: apiPath,
    method: template.method || "GET",
    catid: catId,
    project_id: projectId,
    status: template.status || "undone",
    type: template.type || "static",
    api_opened: template.api_opened || false,
    req_query: template.req_query || [],
    req_headers: template.req_headers || [],
    req_params: template.req_params || [],
    req_body_type: template.req_body_type || "json",
    req_body_form: template.req_body_form || [],
    req_body_is_json_schema: template.req_body_is_json_schema ?? true,
    res_body_type: template.res_body_type || "json",
    res_body: template.res_body || '{"type":"object","title":"title","properties":{}}',
    res_body_is_json_schema: template.res_body_is_json_schema ?? true,
    tag: template.tag || [],
  };
}

async function addInterface(
  title: string,
  apiPath: string,
  mapping: DocsSyncMapping,
  request: YapiRequest,
): Promise<number> {
  const projectId = Number(mapping.project_id || 0);
  const catId = Number(mapping.catid || 0);
  if (!projectId || !catId) {
    throw new Error("project_id and catid are required to create new docs");
  }
  let template: Record<string, any> = {};
  if (mapping.template_id) {
    const resp = await request("/api/interface/get", "GET", { id: mapping.template_id });
    if (resp?.errcode !== 0) {
      throw new Error(`interface get failed: ${resp?.errmsg || "unknown error"}`);
    }
    template = resp?.data || {};
  }
  const payload = buildAddPayload(template, title, apiPath, catId, projectId);
  const resp = await request("/api/interface/add", "POST", {}, payload);
  if (resp?.errcode !== 0) {
    throw new Error(`interface add failed: ${resp?.errmsg || "unknown error"}`);
  }
  const newId = resp?.data?._id;
  if (!newId) {
    throw new Error("interface add succeeded but missing id");
  }
  return Number(newId);
}

async function updateInterface(
  docId: number,
  title: string | undefined,
  markdown: string,
  html: string,
  request: YapiRequest,
): Promise<void> {
  const payload: Record<string, unknown> = { id: docId, markdown, desc: html };
  if (title) {
    payload.title = title;
  }
  const resp = await request("/api/interface/up", "POST", {}, payload);
  if (resp?.errcode !== 0) {
    throw new Error(`interface up failed: ${resp?.errmsg || "unknown error"}`);
  }
}

async function syncDocsDir(
  dirPath: string,
  mapping: DocsSyncMapping,
  options: DocsSyncOptions,
  request: YapiRequest,
): Promise<{
  updated: number;
  created: number;
  skipped: number;
  files: Record<string, DocsSyncFileInfo>;
}> {
  if (!mapping.files || typeof mapping.files !== "object") {
    mapping.files = {};
  }
  if (!mapping.file_hashes || typeof mapping.file_hashes !== "object") {
    mapping.file_hashes = {};
  }

  const envProjectId = process.env.YAPI_PROJECT_ID;
  const envCatId = process.env.YAPI_CATID;
  const envTemplateId = process.env.YAPI_TEMPLATE_ID;
  if (!mapping.project_id && envProjectId) mapping.project_id = Number(envProjectId);
  if (!mapping.catid && envCatId) mapping.catid = Number(envCatId);
  if (!mapping.template_id && envTemplateId) mapping.template_id = Number(envTemplateId);

  if (!mapping.project_id || !mapping.catid) {
    throw new Error("project_id/catid missing; set in binding/.yapi.json or env");
  }

  const { byPath, byTitle, byId } = await listExistingInterfaces(Number(mapping.catid), request);

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const fileInfos: Record<string, DocsSyncFileInfo> = {};
  const files = resolveSourceFiles(dirPath, mapping);
  for (const mdPath of files) {
    const stem = path.parse(mdPath).name;
    const relName = path.basename(mdPath);
    const apiPath = `/${stem}`;

    const markdown = fs.readFileSync(mdPath, "utf8");
    const desiredTitle = extractFirstMarkdownH1Title(markdown).trim() || stem;

    let docId = mapping.files[relName];
    if (!docId) {
      docId = byPath[apiPath] || byTitle[desiredTitle] || byTitle[stem];
      if (docId) mapping.files[relName] = docId;
    }

    if (!docId) {
      created += 1;
      if (!options.dryRun) {
        docId = await addInterface(desiredTitle, apiPath, mapping, request);
        mapping.files[relName] = docId;
      }
    }

    if (docId) {
      const resolvedPath = byId[String(docId)]?.path || apiPath;
      fileInfos[relName] = { docId: Number(docId), apiPath: resolvedPath };
    }

    const contentHash = buildDocsSyncHash(markdown, options);
    const previousHash = mapping.file_hashes[relName];

    const currentTitle = docId ? byId[String(docId)]?.title : "";
    const titleToUpdate = !docId
      ? undefined
      : !currentTitle || currentTitle !== desiredTitle
        ? desiredTitle
        : undefined;
    const shouldSyncTitle = Boolean(titleToUpdate);

    if (
      !options.force &&
      docId &&
      previousHash &&
      previousHash === contentHash &&
      !shouldSyncTitle
    ) {
      skipped += 1;
      continue;
    }

    const logPrefix = `[docs-sync:${relName}]`;
    let mermaidFailed = false;
    let diagramFailed = false;
    const html = renderMarkdownToHtml(markdown, {
      noMermaid: options.noMermaid,
      logMermaid: true,
      mermaidLook: options.mermaidLook,
      mermaidHandDrawnSeed: options.mermaidHandDrawnSeed,
      d2Sketch: options.d2Sketch,
      logger: (message) => console.log(`${logPrefix} ${message}`),
      onMermaidError: () => {
        mermaidFailed = true;
      },
      onDiagramError: () => {
        diagramFailed = true;
      },
    });
    if (!options.dryRun && docId) {
      await updateInterface(docId, titleToUpdate, markdown, html, request);
    }
    if (docId && !mermaidFailed && !diagramFailed) {
      mapping.file_hashes[relName] = contentHash;
    }
    updated += 1;
  }

  return { updated, created, skipped, files: fileInfos };
}

function buildEnvUrls(
  projectInfo: DocsSyncProjectInfo | null,
  apiPath: string,
): Record<string, string> {
  const urls: Record<string, string> = {};
  if (!projectInfo || !projectInfo.envs || !projectInfo.envs.length) return urls;
  const basepath = projectInfo.basepath || "";
  projectInfo.envs.forEach((env, index) => {
    const rawKey = env.name || env.domain || `env${index + 1}`;
    const url = buildEnvUrl(env.domain, basepath, apiPath);
    if (!url) return;
    let key = rawKey;
    let suffix = 1;
    while (urls[key]) {
      suffix += 1;
      key = `${rawKey}-${suffix}`;
    }
    urls[key] = url;
  });
  return urls;
}

async function updateDocsSyncCaches(
  homeDir: string,
  baseUrl: string,
  bindingResults: Record<
    string,
    { binding: DocsSyncBinding; files: Record<string, DocsSyncFileInfo> }
  >,
  request: YapiRequest,
): Promise<void> {
  const linksConfig = loadDocsSyncLinks(homeDir);
  const projectsConfig = loadDocsSyncProjects(homeDir);
  const deploymentsConfig = loadDocsSyncDeployments(homeDir);
  const projectCache = new Map<number, DocsSyncProjectInfo | null>();

  const resolveProjectInfo = async (projectId: number): Promise<DocsSyncProjectInfo | null> => {
    if (!projectId) return null;
    if (projectCache.has(projectId)) return projectCache.get(projectId) || null;
    const existing = projectsConfig.projects[String(projectId)] || null;
    try {
      const fresh = await fetchProjectInfo(projectId, baseUrl, request);
      if (fresh) {
        projectsConfig.projects[String(projectId)] = fresh;
        projectCache.set(projectId, fresh);
        return fresh;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`project get failed (project_id=${projectId}): ${message}`);
    }
    projectCache.set(projectId, existing);
    return existing;
  };

  for (const [name, result] of Object.entries(bindingResults)) {
    const binding = result.binding;
    const projectId = Number(binding.project_id || 0);

    const linkFiles: Record<string, DocsSyncLinkEntry> = {};
    const deploymentFiles: Record<string, DocsSyncDeploymentEntry> = {};
    const projectInfo = await resolveProjectInfo(projectId);

    for (const [fileName, fileInfo] of Object.entries(result.files)) {
      const docUrl = projectId ? buildInterfaceWebUrl(baseUrl, projectId, fileInfo.docId) : "";
      linkFiles[fileName] = {
        doc_id: fileInfo.docId,
        api_path: fileInfo.apiPath,
        url: docUrl,
      };

      deploymentFiles[fileName] = {
        api_path: fileInfo.apiPath,
        env_urls: buildEnvUrls(projectInfo, fileInfo.apiPath),
      };
    }

    linksConfig.bindings[name] = {
      dir: binding.dir,
      project_id: projectId || undefined,
      catid: binding.catid,
      files: linkFiles,
    };

    deploymentsConfig.bindings[name] = {
      dir: binding.dir,
      project_id: projectId || undefined,
      files: deploymentFiles,
    };
  }

  saveDocsSyncLinks(homeDir, linksConfig);
  saveDocsSyncProjects(homeDir, projectsConfig);
  saveDocsSyncDeployments(homeDir, deploymentsConfig);
}

async function runDocsSyncBindings(rawArgs: string[]): Promise<number> {
  const action = (rawArgs[0] || "list").toLowerCase();
  const args = rawArgs[0] ? rawArgs.slice(1) : rawArgs;
  const options = parseDocsSyncBindArgs(args);
  if (options.help) {
    console.log(docsSyncBindUsage());
    return 0;
  }

  const writeActions = new Set(["add", "update", "remove", "rm", "delete", "del"]);
  const readActions = new Set(["list", "get"]);
  if (!writeActions.has(action) && !readActions.has(action)) {
    console.error(`unknown docs-sync bind action: ${action}`);
    console.error(docsSyncBindUsage());
    return 2;
  }

  const homeDir = resolveDocsSyncHome(process.cwd(), writeActions.has(action));
  if (!homeDir) {
    if (action === "list") {
      console.log("no docs-sync bindings (missing .yapi/docs-sync.json)");
      return 0;
    }
    console.error(
      "missing .yapi/docs-sync.json (run in project root or create one with docs-sync bind add)",
    );
    return 2;
  }

  const rootDir = path.dirname(homeDir);
  const config = loadDocsSyncConfig(homeDir);

  if (action === "list") {
    const entries = Object.entries(config.bindings).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
      console.log("no docs-sync bindings");
      return 0;
    }
    for (const [name, binding] of entries) {
      const filesCount = binding.files ? Object.keys(binding.files).length : 0;
      console.log(
        `${name} dir=${binding.dir} project_id=${binding.project_id ?? ""} catid=${binding.catid ?? ""}` +
          (binding.template_id ? ` template_id=${binding.template_id}` : "") +
          ` files=${filesCount}`,
      );
    }
    return 0;
  }

  if (!options.name) {
    console.error("missing --name for docs-sync bind action");
    console.error(docsSyncBindUsage());
    return 2;
  }

  if (action === "get") {
    const binding = config.bindings[options.name];
    if (!binding) {
      console.error(`binding not found: ${options.name}`);
      return 2;
    }
    console.log(JSON.stringify(binding, null, 2));
    return 0;
  }

  if (action === "remove" || action === "rm" || action === "delete" || action === "del") {
    if (!config.bindings[options.name]) {
      console.error(`binding not found: ${options.name}`);
      return 2;
    }
    delete config.bindings[options.name];
    saveDocsSyncConfig(homeDir, config);
    console.log(`binding removed: ${options.name}`);
    return 0;
  }

  const hasExisting = Boolean(config.bindings[options.name]);
  if (action === "add" && hasExisting) {
    console.error(`binding already exists: ${options.name}`);
    return 2;
  }
  if (action === "update" && !hasExisting) {
    console.error(`binding not found: ${options.name}`);
    return 2;
  }

  if (action === "add") {
    if (
      !options.dir ||
      !Number.isFinite(options.projectId ?? NaN) ||
      !Number.isFinite(options.catId ?? NaN)
    ) {
      console.error("add requires --dir, --project-id, and --catid");
      console.error(docsSyncBindUsage());
      return 2;
    }
  }

  const existing = config.bindings[options.name] || ({} as DocsSyncBinding);
  const next: DocsSyncBinding = {
    dir: existing.dir || "",
    project_id: existing.project_id,
    catid: existing.catid,
    template_id: existing.template_id,
    source_files: existing.source_files ? [...existing.source_files] : undefined,
    files: existing.files ? { ...existing.files } : {},
    file_hashes: existing.file_hashes ? { ...existing.file_hashes } : {},
  };

  if (options.dir) {
    next.dir = normalizeBindingDir(rootDir, options.dir);
  }
  if (options.projectId !== undefined && Number.isFinite(options.projectId)) {
    next.project_id = Number(options.projectId);
  }
  if (options.catId !== undefined && Number.isFinite(options.catId)) {
    next.catid = Number(options.catId);
  }
  if (options.templateId !== undefined && Number.isFinite(options.templateId)) {
    next.template_id = Number(options.templateId);
  }
  if (options.clearSourceFiles) {
    next.source_files = [];
  } else if (options.sourceFiles && options.sourceFiles.length) {
    next.source_files = options.sourceFiles;
  }

  if (!next.dir || !next.project_id || !next.catid) {
    console.error("binding requires dir/project_id/catid");
    return 2;
  }

  config.bindings[options.name] = next;
  saveDocsSyncConfig(homeDir, config);
  console.log(`${action === "add" ? "binding added" : "binding updated"}: ${options.name}`);
  return 0;
}

async function runDocsSync(rawArgs: string[]): Promise<number> {
  const firstArg = rawArgs[0];
  if (firstArg === "bind" || firstArg === "bindings") {
    return await runDocsSyncBindings(rawArgs.slice(1));
  }
  const options = parseDocsSyncArgs(rawArgs);
  if (options.help) {
    console.log(docsSyncUsage());
    return 0;
  }

  try {
    if (!isPandocAvailable()) {
      console.warn("pandoc not found, fallback to markdown-it renderer.");
      console.warn("Install pandoc (macOS): brew install pandoc");
      console.warn("More info: https://pandoc.org/installing.html");
    }
    if (!options.noMermaid && !isMmdcAvailable()) {
      console.warn("mmdc not found, Mermaid blocks will stay as code.");
      console.warn("Install mermaid-cli: npm i -g @mermaid-js/mermaid-cli");
    }
    if (!isPlantUmlAvailable()) {
      console.warn("plantuml not found, PlantUML blocks will be removed from HTML.");
      console.warn("Install PlantUML (macOS): brew install plantuml");
    }
    if (!isGraphvizAvailable()) {
      console.warn("graphviz (dot) not found, Graphviz blocks will be removed from HTML.");
      console.warn("Install Graphviz (macOS): brew install graphviz");
    }
    if (!isD2Available()) {
      console.warn("d2 not found, D2 blocks will be removed from HTML.");
      console.warn("Install D2 (macOS): brew install d2");
    }

    if (options.bindings.length && options.dirs.length) {
      console.error("use --binding or --dir, not both");
      return 2;
    }

    const docsSyncHome = resolveDocsSyncHome(process.cwd(), false);
    const docsSyncConfig = docsSyncHome ? loadDocsSyncConfig(docsSyncHome) : null;
    let bindingNames = options.bindings;
    let useBindings = bindingNames.length > 0;
    if (
      !useBindings &&
      !options.dirs.length &&
      docsSyncConfig &&
      Object.keys(docsSyncConfig.bindings).length
    ) {
      useBindings = true;
      bindingNames = Object.keys(docsSyncConfig.bindings);
    }

    if (useBindings && (!docsSyncHome || !docsSyncConfig)) {
      console.error("missing .yapi/docs-sync.json (run docs-sync bind add or use --dir)");
      return 2;
    }
    if (useBindings && !bindingNames.length) {
      console.error("no docs-sync bindings found (run docs-sync bind add or use --dir)");
      return 2;
    }

    const dirs = useBindings ? [] : options.dirs.length ? options.dirs : ["docs/release-notes"];

    let config: Record<string, string> = {};
    let configPath = options.config || "";
    if (options.config) {
      if (fs.existsSync(configPath)) {
        config = parseSimpleToml(fs.readFileSync(configPath, "utf8"));
      } else {
        const init = await initConfigIfMissing(options);
        if (init) {
          config = init.config;
          configPath = init.configPath;
        } else {
          console.error(`missing config file: ${configPath}`);
          return 2;
        }
      }
    } else {
      const globalPath = globalConfigPath();
      if (fs.existsSync(globalPath)) {
        configPath = globalPath;
        config = parseSimpleToml(fs.readFileSync(globalPath, "utf8"));
      } else {
        const init = await initConfigIfMissing(options);
        if (init) {
          config = init.config;
          configPath = init.configPath;
        } else {
          console.error("missing config: create ~/.yapi/config.toml or pass --config");
          return 2;
        }
      }
    }

    const baseUrl = options.baseUrl || config.base_url || "";
    if (!baseUrl) {
      console.error("missing --base-url or config base_url");
      return 2;
    }

    const projectId = options.projectId || config.project_id || "";
    const rawToken = options.token || config.token || "";
    const token = resolveToken(rawToken, projectId);

    let authMode = (options.authMode || config.auth_mode || "").trim().toLowerCase();
    if (!authMode) {
      authMode = token
        ? "token"
        : options.email || options.password || config.email || config.password
          ? "global"
          : "token";
    }
    if (authMode !== "token" && authMode !== "global") {
      console.error("invalid --auth-mode (use token or global)");
      return 2;
    }

    const headers: Record<string, string> = {};
    const email = options.email || config.email || "";
    const password = options.password || config.password || "";
    const authService =
      authMode === "global"
        ? new YApiAuthService(baseUrl, email || "", password || "", "warn", {
            timeoutMs: options.timeout || 30000,
          })
        : null;
    const canRelogin =
      authMode === "global" &&
      Boolean(authService) &&
      Boolean(email) &&
      Boolean(password) &&
      !options.cookie;

    if (options.cookie) {
      headers.Cookie = options.cookie;
    } else if (authMode === "global") {
      const cachedCookie = authService?.getCachedCookieHeader();
      if (cachedCookie) {
        headers.Cookie = cachedCookie;
      } else if (email && password && authService) {
        try {
          headers.Cookie = await authService.getCookieHeaderWithLogin();
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          return 2;
        }
      } else {
        console.error("missing email/password for global auth");
        return 2;
      }
    }

    const request: YapiRequest = async (endpoint, method, query = {}, data) => {
      const queryItems: [string, string][] = [];
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          queryItems.push([key, String(value)]);
        }
      }
      const url = buildUrl(
        baseUrl,
        endpoint,
        queryItems,
        authMode === "token" ? token : "",
        options.tokenParam || "token",
      );

      let body: string | undefined;
      if (data !== undefined) {
        body = JSON.stringify(data);
      }

      const sendOnce = async () => {
        const requestHeaders: Record<string, string> = { ...headers };
        if (body !== undefined) {
          requestHeaders["Content-Type"] = "application/json;charset=UTF-8";
        }
        const response = await fetchWithTimeout(
          url,
          {
            method,
            headers: requestHeaders,
            body,
          },
          options.timeout || 30000,
        );
        const text = await response.text();
        return { response, text, json: parseJsonMaybe(text) };
      };

      let result = await sendOnce();
      if (canRelogin && looksLikeAuthError(result.response.status, result.json)) {
        try {
          headers.Cookie = await authService!.getCookieHeaderWithLogin({ forceLogin: true });
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error));
        }
        result = await sendOnce();
      }

      if (!result.response.ok) {
        throw new Error(
          `request failed: ${result.response.status} ${result.response.statusText} ${result.text}`,
        );
      }
      if (!result.json) {
        throw new Error(`invalid JSON response from ${endpoint}`);
      }
      return result.json;
    };

    if (useBindings) {
      const rootDir = path.dirname(docsSyncHome!);
      const configForBindings = docsSyncConfig!;

      const dirToBindings = new Map<string, string[]>();
      for (const name of bindingNames) {
        const binding = configForBindings.bindings[name];
        if (!binding) {
          throw new Error(`binding not found: ${name}`);
        }
        const dirPath = resolveBindingDir(rootDir, binding.dir);
        const existing = dirToBindings.get(dirPath) || [];
        existing.push(name);
        dirToBindings.set(dirPath, existing);
      }
      const duplicates = Array.from(dirToBindings.entries()).filter(
        ([, names]) => names.length > 1,
      );
      if (duplicates.length) {
        const lines: string[] = [];
        lines.push("invalid docs-sync bindings: multiple bindings share the same dir");
        duplicates.forEach(([dirPath, names]) => {
          lines.push(`- dir=${dirPath} bindings=${names.join(", ")}`);
        });
        lines.push("");
        lines.push("Fix: split docs into separate directories (recommended).");
        lines.push("Example:");
        lines.push(
          "  yapi docs-sync bind update --name <bindingA> --dir docs/yapi-sync/<bindingA>",
        );
        lines.push(
          "  yapi docs-sync bind update --name <bindingB> --dir docs/yapi-sync/<bindingB>",
        );
        throw new Error(lines.join("\n"));
      }

      const bindingResults: Record<
        string,
        { binding: DocsSyncBinding; files: Record<string, DocsSyncFileInfo> }
      > = {};
      for (const name of bindingNames) {
        const binding = configForBindings.bindings[name];
        if (!binding) {
          throw new Error(`binding not found: ${name}`);
        }
        const dirPath = resolveBindingDir(rootDir, binding.dir);
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
          throw new Error(`dir not found for binding ${name}: ${dirPath}`);
        }

        const result = await syncDocsDir(dirPath, binding, options, request);
        console.log(
          `synced=${result.updated} created=${result.created} skipped=${result.skipped} binding=${name} dir=${dirPath}`,
        );
        bindingResults[name] = { binding, files: result.files };
      }

      if (!options.dryRun) {
        saveDocsSyncConfig(docsSyncHome!, configForBindings);
        await updateDocsSyncCaches(docsSyncHome!, baseUrl, bindingResults, request);
      }
    } else {
      for (const dir of dirs) {
        const dirPath = path.resolve(dir);
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
          throw new Error(`dir not found: ${dirPath}`);
        }

        const { mapping, mappingPath } = loadMapping(dirPath);
        const result = await syncDocsDir(dirPath, mapping, options, request);

        if (!options.dryRun) {
          saveMapping(mapping, mappingPath);
        }

        console.log(
          `synced=${result.updated} created=${result.created} skipped=${result.skipped} dir=${dirPath}`,
        );
      }
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

async function main(): Promise<number> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === "install-skill") {
    await runInstallSkill(rawArgs.slice(1));
    return 0;
  }
  if (rawArgs[0] === "login") {
    return await runLogin(rawArgs.slice(1));
  }
  if (rawArgs[0] === "whoami") {
    return await runWhoami(rawArgs.slice(1));
  }
  if (rawArgs[0] === "search") {
    return await runSearch(rawArgs.slice(1));
  }
  if (rawArgs[0] === "docs-sync") {
    return await runDocsSync(rawArgs.slice(1));
  }

  const options = parseArgs(rawArgs);
  if (options.version) {
    console.log(readVersion());
    return 0;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  if (options.url && options.path) {
    console.error("use --url or --path, not both");
    return 2;
  }

  if (!options.url && !options.path) {
    console.error("missing --path or --url");
    console.error(usage());
    return 2;
  }

  let config: Record<string, string> = {};
  let configPath = options.config || "";
  if (options.config) {
    if (fs.existsSync(configPath)) {
      config = parseSimpleToml(fs.readFileSync(configPath, "utf8"));
    } else {
      const init = await initConfigIfMissing(options);
      if (init) {
        config = init.config;
        configPath = init.configPath;
      } else {
        console.error(`missing config file: ${configPath}`);
        return 2;
      }
    }
  } else {
    const globalPath = globalConfigPath();
    if (fs.existsSync(globalPath)) {
      configPath = globalPath;
      config = parseSimpleToml(fs.readFileSync(globalPath, "utf8"));
    } else {
      const init = await initConfigIfMissing(options);
      if (init) {
        config = init.config;
        configPath = init.configPath;
      } else {
        console.error("missing config: create ~/.yapi/config.toml or pass --config");
        return 2;
      }
    }
  }

  const authBaseUrl = options.baseUrl || config.base_url || "";
  const baseUrl = options.url ? null : authBaseUrl;
  const endpoint = options.url || options.path || "";
  if (!options.url && !baseUrl) {
    console.error("missing --base-url or config base_url");
    return 2;
  }

  const projectId = options.projectId || config.project_id || "";
  const rawToken = options.token || config.token || "";
  const token = resolveToken(rawToken, projectId);

  let authMode = (options.authMode || config.auth_mode || "").trim().toLowerCase();
  if (!authMode) {
    authMode = token
      ? "token"
      : options.email || options.password || config.email || config.password
        ? "global"
        : "token";
  }
  if (authMode !== "token" && authMode !== "global") {
    console.error("invalid --auth-mode (use token or global)");
    return 2;
  }
  if (authMode === "global" && !authBaseUrl) {
    console.error("missing --base-url or config base_url for global auth");
    return 2;
  }

  const headers: Record<string, string> = {};
  for (const header of options.header || []) {
    const [key, value] = parseHeader(header);
    headers[key] = value;
  }

  const email = options.email || config.email || "";
  const password = options.password || config.password || "";
  const authService =
    authMode === "global"
      ? new YApiAuthService(authBaseUrl, email || "", password || "", "warn", {
          timeoutMs: options.timeout || 30000,
        })
      : null;
  const canRelogin =
    authMode === "global" &&
    Boolean(authService) &&
    Boolean(email) &&
    Boolean(password) &&
    !options.cookie;

  if (options.cookie) {
    headers.Cookie = options.cookie;
  } else if (authMode === "global") {
    const cachedCookie = authService?.getCachedCookieHeader();
    if (cachedCookie) {
      headers.Cookie = cachedCookie;
    } else if (email && password && authService) {
      try {
        headers.Cookie = await authService.getCookieHeaderWithLogin();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 2;
      }
    } else {
      console.error("missing email/password for global auth");
      return 2;
    }
  }

  const queryItems: [string, string][] = [];
  for (const query of options.query || []) {
    queryItems.push(parseKeyValue(query));
  }
  const url = buildUrl(
    baseUrl,
    endpoint,
    queryItems,
    authMode === "token" ? token : "",
    options.tokenParam || "token",
  );

  let dataRaw: string | null = null;
  if (options.dataFile) {
    dataRaw = fs.readFileSync(options.dataFile, "utf8");
  } else if (options.data !== undefined) {
    dataRaw = options.data;
  }

  let body: string | undefined;
  const method = (options.method || "GET").toUpperCase();
  if (dataRaw !== null && method !== "GET" && method !== "HEAD") {
    try {
      const parsed = JSON.parse(dataRaw);
      body = JSON.stringify(parsed);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    } catch {
      body = String(dataRaw);
      if (!headers["Content-Type"]) headers["Content-Type"] = "text/plain";
    }
  }

  const sendOnce = async () => {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers,
        body,
      },
      options.timeout || 30000,
    );
    const text = await response.text();
    return { response, text, json: parseJsonMaybe(text) };
  };

  let result: { response: Response; text: string; json: unknown | null };
  try {
    result = await sendOnce();
  } catch (error) {
    console.error("request failed: " + (error instanceof Error ? error.message : String(error)));
    return 2;
  }

  if (canRelogin && looksLikeAuthError(result.response.status, result.json)) {
    try {
      headers.Cookie = await authService!.getCookieHeaderWithLogin({ forceLogin: true });
      result = await sendOnce();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  const { text } = result;
  if (options.noPretty) {
    console.log(text);
    return 0;
  }
  try {
    const payload = result.json ?? JSON.parse(text);
    console.log(JSON.stringify(payload, null, 2));
  } catch {
    console.log(text);
  }
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
