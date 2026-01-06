import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import yargs from "yargs";

const SKILL_NAME = "yapi";
const PLACEHOLDER_EMAIL = "YOUR_EMAIL";
const PLACEHOLDER_PASSWORD = "YOUR_PASSWORD";

const SKILL_MD = [
  "---",
  "name: yapi",
  'description: Query and sync YApi interface documentation. Use when user mentions \"yapi 接口文档\", YAPI docs, asks for request/response details, or needs docs sync.',
  "---",
  "",
  "# YApi interface docs",
  "",
  "## Workflow",
  "1. Load config from `~/.yapi/config.toml` (preferred) or `config.toml` in this skill directory (base_url, auth_mode, email/password or token, optional project_id).",
  "2. Identify the target interface by id or keyword; ask for project/category ids if needed.",
  "3. Call YApi endpoints with `scripts/yapi_request.js` to fetch raw JSON.",
  "4. Summarize method, path, headers, query/body schema, response schema, and examples.",
  "",
  "## Docs sync",
  "- Bind local docs to YApi category with `yapi docs-sync bind add --name <binding> --dir <path> --project-id <id> --catid <id>` (stored in `.yapi/docs-sync.json`).",
  "- Sync with `yapi docs-sync --binding <binding>` or run all bindings with `yapi docs-sync`.",
  "",
  "## Script",
  "- Basic: `node <skill-dir>/scripts/yapi_request.js --path /api/interface/get --query id=123`",
  "- The script reads `~/.yapi/config.toml` first, then `<skill-dir>/config.toml`; pass `--config` for a custom path.",
  "- Use `--base-url`, `--token`, `--project-id` to override config.",
  "- For `auth_mode=global`, the script logs in via `/api/user/login` and uses the returned cookie automatically.",
  "- For POST: `--method POST --data '{\"key\":\"value\"}'`",
  "- If your instance differs, pass a full URL with `--url`.",
  "",
].join("\n");

const REQUEST_SCRIPT = [
  "#!/usr/bin/env node",
  "\"use strict\";",
  "",
  "const fs = require(\"fs\");",
  "const os = require(\"os\");",
  "const path = require(\"path\");",
  "const readline = require(\"readline\");",
  "",
  "function parseKeyValue(raw) {",
  "  if (!raw || !raw.includes(\"=\")) throw new Error(\"expected key=value\");",
  "  const idx = raw.indexOf(\"=\");",
  "  return [raw.slice(0, idx), raw.slice(idx + 1)];",
  "}",
  "",
  "function parseHeader(raw) {",
  "  if (!raw || !raw.includes(\":\")) throw new Error(\"expected Header:Value\");",
  "  const idx = raw.indexOf(\":\");",
  "  return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];",
  "}",
  "",
  "function joinUrl(baseUrl, endpoint) {",
  "  if (!baseUrl) return endpoint;",
  "  if (baseUrl.endsWith(\"/\") && endpoint.startsWith(\"/\")) return baseUrl.slice(0, -1) + endpoint;",
  "  if (!baseUrl.endsWith(\"/\") && !endpoint.startsWith(\"/\")) return baseUrl + \"/\" + endpoint;",
  "  return baseUrl + endpoint;",
  "}",
  "",
  "function globalConfigPath() {",
  "  const yapiHome = process.env.YAPI_HOME || path.join(os.homedir(), \".yapi\");",
  "  return path.join(yapiHome, \"config.toml\");",
  "}",
  "",
  "function localConfigPath() {",
  "  return path.resolve(__dirname, \"..\", \"config.toml\");",
  "}",
  "",
  "function ensureDir(dirPath) {",
  "  try {",
  "    fs.mkdirSync(dirPath, { recursive: true });",
  "  } catch {",
  "    // ignore",
  "  }",
  "}",
  "",
  "function escapeTomlValue(value) {",
  "  return String(value || \"\").replace(/\\\\/g, \"\\\\\\\\\").replace(/\\\"/g, \"\\\\\\\"\");",
  "}",
  "",
  "function formatToml(config) {",
  "  const orderedKeys = [\"base_url\", \"auth_mode\", \"email\", \"password\", \"token\", \"project_id\"];",
  "  const lines = [\"# YApi CLI config\"];",
  "  for (const key of orderedKeys) {",
  "    const value = config[key] || \"\";",
  "    lines.push(`${key} = \\\"${escapeTomlValue(value)}\\\"`);",
  "  }",
  "  return lines.join(\"\\n\") + \"\\n\";",
  "}",
  "",
  "function writeConfig(filePath, config) {",
  "  ensureDir(path.dirname(filePath));",
  "  fs.writeFileSync(filePath, formatToml(config), \"utf8\");",
  "}",
  "",
  "function promptText(question) {",
  "  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });",
  "  return new Promise((resolve) => {",
  "    rl.question(question, (answer) => {",
  "      rl.close();",
  "      resolve(answer);",
  "    });",
  "  });",
  "}",
  "",
  "function promptHidden(question) {",
  "  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });",
  "  const originalWrite = rl._writeToOutput;",
  "  rl._writeToOutput = function writeToOutput(stringToWrite) {",
  "    if (rl.stdoutMuted) return;",
  "    if (typeof originalWrite === \"function\") {",
  "      originalWrite.call(this, stringToWrite);",
  "    } else {",
  "      rl.output.write(stringToWrite);",
  "    }",
  "  };",
  "  rl.stdoutMuted = true;",
  "  return new Promise((resolve) => {",
  "    rl.question(question, (answer) => {",
  "      rl.stdoutMuted = false;",
  "      rl.close();",
  "      resolve(answer);",
  "    });",
  "  });",
  "}",
  "",
  "async function promptRequired(question, hidden) {",
  "  while (true) {",
  "    const answer = hidden ? await promptHidden(question) : await promptText(question);",
  "    const trimmed = String(answer || \"\").trim();",
  "    if (trimmed) return trimmed;",
  "  }",
  "}",
  "",
  "async function initConfigIfMissing(options) {",
  "  const hasBaseUrl = Boolean(options.baseUrl);",
  "  const hasEmail = Boolean(options.email);",
  "  const hasPassword = Boolean(options.password);",
  "  if (!hasBaseUrl || !hasEmail || !hasPassword) {",
  "    if (!process.stdin.isTTY || !process.stdout.isTTY) return null;",
  "  }",
  "  const baseUrl = hasBaseUrl ? options.baseUrl : await promptRequired(\"YApi base URL: \", false);",
  "  const email = hasEmail ? options.email : await promptRequired(\"YApi email: \", false);",
  "  const password = hasPassword ? options.password : await promptRequired(\"YApi password: \", true);",
  "  const config = {",
  "    base_url: baseUrl,",
  "    auth_mode: \"global\",",
  "    email,",
  "    password,",
  "    token: options.token || \"\",",
  "    project_id: options.projectId || \"\",",
  "  };",
  "  const configPath = globalConfigPath();",
  "  writeConfig(configPath, config);",
  "  return { configPath, config };",
  "}",
  "",
  "function parseSimpleToml(text) {",
  "  const data = {};",
  "  const lines = String(text || \"\").split(/\\r?\\n/);",
  "  for (const rawLine of lines) {",
  "    const line = rawLine.split(\"#\", 1)[0].split(\";\", 1)[0].trim();",
  "    if (!line || line.startsWith(\"[\")) continue;",
  "    const idx = line.indexOf(\"=\");",
  "    if (idx === -1) continue;",
  "    const key = line.slice(0, idx).trim();",
  "    let value = line.slice(idx + 1).trim();",
  "    if (!key) continue;",
  "    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith(\"'\") && value.endsWith(\"'\"))) {",
  "      value = value.slice(1, -1);",
  "    }",
  "    data[key] = value;",
  "  }",
  "  return data;",
  "}",
  "",
  "function resolveToken(tokenValue, projectId) {",
  "  if (!tokenValue) return \"\";",
  "  if (tokenValue.includes(\",\") || tokenValue.includes(\":\")) {",
  "    let defaultToken = \"\";",
  "    const mapping = {};",
  "    tokenValue.split(\",\").forEach((rawPair) => {",
  "      const pair = rawPair.trim();",
  "      if (!pair) return;",
  "      const idx = pair.indexOf(\":\");",
  "      if (idx === -1) {",
  "        defaultToken = pair;",
  "        return;",
  "      }",
  "      const pid = pair.slice(0, idx).trim();",
  "      const token = pair.slice(idx + 1).trim();",
  "      if (pid && token) mapping[pid] = token;",
  "    });",
  "    if (projectId && mapping[projectId]) return mapping[projectId];",
  "    if (defaultToken) return defaultToken;",
  "    const keys = Object.keys(mapping);",
  "    if (keys.length) return mapping[keys[0]];",
  "  }",
  "  return tokenValue;",
  "}",
  "",
  "function getSetCookie(headers) {",
  "  if (!headers) return [];",
  "  if (typeof headers.getSetCookie === \"function\") return headers.getSetCookie();",
  "  const value = headers.get(\"set-cookie\");",
  "  return value ? [value] : [];",
  "}",
  "",
  "function extractCookieValue(setCookies, name) {",
  "  if (!setCookies || !setCookies.length) return \"\";",
  "  for (const entry of setCookies) {",
  "    const parts = String(entry || \"\").split(\";\");",
  "    for (const part of parts) {",
  "      const item = part.trim();",
  "      if (item.startsWith(name + \"=\")) return item.split(\"=\").slice(1).join(\"=\");",
  "    }",
  "  }",
  "  return \"\";",
  "}",
  "",
  "async function fetchWithTimeout(url, options, timeoutMs) {",
  "  const controller = new AbortController();",
  "  const timer = setTimeout(() => controller.abort(), timeoutMs);",
  "  try {",
  "    return await fetch(url, { ...options, signal: controller.signal });",
  "  } finally {",
  "    clearTimeout(timer);",
  "  }",
  "}",
  "",
  "async function loginGetCookie(baseUrl, email, password, timeoutMs) {",
  "  const url = joinUrl(baseUrl, \"/api/user/login\");",
  "  const payload = JSON.stringify({ email, password });",
  "  const response = await fetchWithTimeout(url, {",
  "    method: \"POST\",",
  "    headers: { \"Content-Type\": \"application/json;charset=UTF-8\" },",
  "    body: payload,",
  "  }, timeoutMs);",
  "  const bodyText = await response.text();",
  "  const setCookies = getSetCookie(response.headers);",
  "  const yapiToken = extractCookieValue(setCookies, \"_yapi_token\");",
  "  const yapiUid = extractCookieValue(setCookies, \"_yapi_uid\");",
  "  if (!yapiToken) {",
  "    let message = \"login failed: missing _yapi_token cookie\";",
  "    try {",
  "      const payload = JSON.parse(bodyText);",
  "      if (payload && typeof payload === \"object\" && payload.errmsg) message = payload.errmsg;",
  "    } catch {",
  "      // ignore",
  "    }",
  "    throw new Error(message);",
  "  }",
  "  let cookie = `_yapi_token=${yapiToken}`;",
  "  if (yapiUid) cookie = `${cookie}; _yapi_uid=${yapiUid}`;",
  "  return cookie;",
  "}",
  "",
  "function buildUrl(baseUrl, endpoint, queryItems, token, tokenParam) {",
  "  const url = baseUrl ? joinUrl(baseUrl, endpoint) : endpoint;",
  "  const parsed = new URL(url);",
  "  if (Array.isArray(queryItems)) {",
  "    for (const [key, value] of queryItems) {",
  "      if (key) parsed.searchParams.append(key, value ?? \"\");",
  "    }",
  "  }",
  "  if (token) {",
  "    if (!parsed.searchParams.has(tokenParam)) {",
  "      parsed.searchParams.append(tokenParam, token);",
  "    }",
  "  }",
  "  return parsed.toString();",
  "}",
  "",
  "function parseArgs(argv) {",
  "  const options = {",
  "    query: [],",
  "    header: [],",
  "    method: \"GET\",",
  "    tokenParam: \"token\",",
  "    timeout: 30000,",
  "  };",
  "  for (let i = 0; i < argv.length; i += 1) {",
  "    const arg = argv[i];",
  "    if (!arg) continue;",
  "    if (arg === \"--config\") { options.config = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--config=\")) { options.config = arg.slice(9); continue; }",
  "    if (arg === \"--base-url\") { options.baseUrl = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--base-url=\")) { options.baseUrl = arg.slice(11); continue; }",
  "    if (arg === \"--token\") { options.token = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--token=\")) { options.token = arg.slice(8); continue; }",
  "    if (arg === \"--project-id\") { options.projectId = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--project-id=\")) { options.projectId = arg.slice(13); continue; }",
  "    if (arg === \"--auth-mode\") { options.authMode = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--auth-mode=\")) { options.authMode = arg.slice(12); continue; }",
  "    if (arg === \"--email\") { options.email = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--email=\")) { options.email = arg.slice(8); continue; }",
  "    if (arg === \"--password\") { options.password = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--password=\")) { options.password = arg.slice(11); continue; }",
  "    if (arg === \"--cookie\") { options.cookie = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--cookie=\")) { options.cookie = arg.slice(9); continue; }",
  "    if (arg === \"--token-param\") { options.tokenParam = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--token-param=\")) { options.tokenParam = arg.slice(14); continue; }",
  "    if (arg === \"--method\") { options.method = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--method=\")) { options.method = arg.slice(9); continue; }",
  "    if (arg === \"--path\") { options.path = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--path=\")) { options.path = arg.slice(7); continue; }",
  "    if (arg === \"--url\") { options.url = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--url=\")) { options.url = arg.slice(6); continue; }",
  "    if (arg === \"--query\") { options.query.push(argv[++i]); continue; }",
  "    if (arg.startsWith(\"--query=\")) { options.query.push(arg.slice(8)); continue; }",
  "    if (arg === \"--header\") { options.header.push(argv[++i]); continue; }",
  "    if (arg.startsWith(\"--header=\")) { options.header.push(arg.slice(9)); continue; }",
  "    if (arg === \"--data\") { options.data = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--data=\")) { options.data = arg.slice(7); continue; }",
  "    if (arg === \"--data-file\") { options.dataFile = argv[++i]; continue; }",
  "    if (arg.startsWith(\"--data-file=\")) { options.dataFile = arg.slice(12); continue; }",
  "    if (arg === \"--timeout\") { options.timeout = Number(argv[++i]); continue; }",
  "    if (arg.startsWith(\"--timeout=\")) { options.timeout = Number(arg.slice(10)); continue; }",
  "    if (arg === \"--no-pretty\") { options.noPretty = true; continue; }",
  "    if (arg === \"--help\" || arg === \"-h\") { options.help = true; continue; }",
  "  }",
  "  return options;",
  "}",
  "",
  "function usage() {",
  "  return [",
  "    \"Usage:\",",
  "    \"  node yapi_request.js --path /api/interface/get --query id=123\",",
  "    \"Options:\",",
  "    \"  --config <path>        config file path (default: ~/.yapi/config.toml)\",",
  "    \"  --base-url <url>       YApi base URL\",",
  "    \"  --token <token>        project token (supports projectId:token)\",",
  "    \"  --project-id <id>      select token for project\",",
  "    \"  --auth-mode <mode>     token or global\",",
  "    \"  --email <email>        login email for global mode\",",
  "    \"  --password <pwd>       login password for global mode\",",
  "    \"  --path <path>          API path (e.g., /api/interface/get)\",",
  "    \"  --url <url>            full URL (overrides base-url/path)\",",
  "    \"  --query key=value      query param (repeatable)\",",
  "    \"  --header Header:Value  request header (repeatable)\",",
  "    \"  --method <method>      HTTP method\",",
  "    \"  --data <payload>       request body (JSON or text)\",",
  "    \"  --data-file <file>     request body file\",",
  "    \"  --timeout <ms>         request timeout in ms\",",
  "    \"  --no-pretty            print raw response\",",
  "  ].join(\"\\n\");",
  "}",
  "",
  "async function main() {",
  "  const options = parseArgs(process.argv.slice(2));",
  "  if (options.help) {",
  "    console.log(usage());",
  "    return 0;",
  "  }",
  "",
  "  if (options.url && options.path) {",
  "    console.error(\"use --url or --path, not both\");",
  "    return 2;",
  "  }",
  "",
  "  if (!options.url && !options.path) {",
  "    console.error(\"missing --path or --url\");",
  "    console.error(usage());",
  "    return 2;",
  "  }",
  "",
  "  let config = {};",
  "  let configPath = options.config || \"\";",
  "  if (options.config) {",
  "    if (fs.existsSync(configPath)) {",
  "      config = parseSimpleToml(fs.readFileSync(configPath, \"utf8\"));",
  "    } else {",
  "      const init = await initConfigIfMissing(options);",
  "      if (init) {",
  "        config = init.config;",
  "        configPath = init.configPath;",
  "      } else {",
  "        console.error(`missing config file: ${configPath}`);",
  "        return 2;",
  "      }",
  "    }",
  "  } else {",
  "    const globalPath = globalConfigPath();",
  "    const localPath = localConfigPath();",
  "    if (fs.existsSync(globalPath)) {",
  "      configPath = globalPath;",
  "      config = parseSimpleToml(fs.readFileSync(globalPath, \"utf8\"));",
  "    } else if (fs.existsSync(localPath)) {",
  "      configPath = localPath;",
  "      config = parseSimpleToml(fs.readFileSync(localPath, \"utf8\"));",
  "    } else {",
  "      const init = await initConfigIfMissing(options);",
  "      if (init) {",
  "        config = init.config;",
  "        configPath = init.configPath;",
  "      } else {",
  "        console.error(\"missing config: create ~/.yapi/config.toml or pass --config\");",
  "        return 2;",
  "      }",
  "    }",
  "  }",
  "",
  "  const baseUrl = options.url ? null : (options.baseUrl || config.base_url || \"\");",
  "  const endpoint = options.url || options.path;",
  "  if (!options.url && !baseUrl) {",
  "    console.error(\"missing --base-url or config base_url\");",
  "    return 2;",
  "  }",
  "",
  "  const projectId = options.projectId || config.project_id || \"\";",
  "  const rawToken = options.token || config.token || \"\";",
  "  const token = resolveToken(rawToken, projectId);",
  "",
  "  let authMode = (options.authMode || config.auth_mode || \"\").trim().toLowerCase();",
  "  if (!authMode) {",
  "    authMode = token ? \"token\" : (options.email || options.password || config.email || config.password) ? \"global\" : \"token\";",
  "  }",
  "  if (authMode !== \"token\" && authMode !== \"global\") {",
  "    console.error(\"invalid --auth-mode (use token or global)\");",
  "    return 2;",
  "  }",
  "",
  "  const headers = {};",
  "  for (const header of options.header || []) {",
  "    const [key, value] = parseHeader(header);",
  "    headers[key] = value;",
  "  }",
  "",
  "  if (options.cookie) {",
  "    headers.Cookie = options.cookie;",
  "  } else if (authMode === \"global\") {",
  "    const email = options.email || config.email;",
  "    const password = options.password || config.password;",
  "    if (!email || !password) {",
  "      console.error(\"missing email/password for global auth\");",
  "      return 2;",
  "    }",
  "    try {",
  "      headers.Cookie = await loginGetCookie(baseUrl, email, password, options.timeout);",
  "    } catch (error) {",
  "      console.error(error && error.message ? error.message : String(error));",
  "      return 2;",
  "    }",
  "  }",
  "",
  "  const queryItems = [];",
  "  for (const query of options.query || []) {",
  "    queryItems.push(parseKeyValue(query));",
  "  }",
  "  const url = buildUrl(baseUrl, endpoint, queryItems, authMode === \"token\" ? token : \"\", options.tokenParam);",
  "",
  "  let dataRaw = null;",
  "  if (options.dataFile) {",
  "    dataRaw = fs.readFileSync(options.dataFile, \"utf8\");",
  "  } else if (options.data !== undefined) {",
  "    dataRaw = options.data;",
  "  }",
  "",
  "  let body;",
  "  if (dataRaw !== null && options.method.toUpperCase() !== \"GET\" && options.method.toUpperCase() !== \"HEAD\") {",
  "    try {",
  "      const parsed = JSON.parse(dataRaw);",
  "      body = JSON.stringify(parsed);",
  "      if (!headers[\"Content-Type\"]) headers[\"Content-Type\"] = \"application/json\";",
  "    } catch {",
  "      body = String(dataRaw);",
  "      if (!headers[\"Content-Type\"]) headers[\"Content-Type\"] = \"text/plain\";",
  "    }",
  "  }",
  "",
  "  let response;",
  "  try {",
  "    response = await fetchWithTimeout(url, {",
  "      method: options.method.toUpperCase(),",
  "      headers,",
  "      body,",
  "    }, options.timeout);",
  "  } catch (error) {",
  "    console.error(\"request failed: \" + (error && error.message ? error.message : String(error)));",
  "    return 2;",
  "  }",
  "",
  "  const text = await response.text();",
  "  if (options.noPretty) {",
  "    console.log(text);",
  "    return 0;",
  "  }",
  "  try {",
  "    const payload = JSON.parse(text);",
  "    console.log(JSON.stringify(payload, null, 2));",
  "  } catch {",
  "    console.log(text);",
  "  }",
  "  return 0;",
  "}",
  "",
  "main().then((code) => {",
  "  process.exitCode = code;",
  "});",
  "",
].join("\n");

type InstallArgs = {
  "yapi-base-url"?: string;
  "yapi-token"?: string;
  "yapi-auth-mode"?: "token" | "global";
  "yapi-email"?: string;
  "yapi-password"?: string;
  "project-id"?: string;
  "yapi-home"?: string;
  "codex-home"?: string;
  "claude-home"?: string;
  force?: boolean;
};

function parseSimpleToml(text: string): Record<string, string> {
  const data: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].split(";", 1)[0].trim();
    if (!line || line.startsWith("[")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

function escapeTomlValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function formatToml(config: Record<string, string>): string {
  const orderedKeys = ["base_url", "auth_mode", "email", "password", "token", "project_id"];
  const lines = ["# YApi skill config"];

  for (const key of orderedKeys) {
    const value = config[key] ?? "";
    lines.push(`${key} = "${escapeTomlValue(value)}"`);
  }

  const extras = Object.keys(config).filter((key) => !orderedKeys.includes(key)).sort();
  for (const key of extras) {
    const value = config[key] ?? "";
    lines.push(`${key} = "${escapeTomlValue(value)}"`);
  }

  return `${lines.join("\n")}\n`;
}

function writeFileIfNeeded(filePath: string, contents: string, force: boolean): boolean {
  if (!force && fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, contents, "utf8");
  return true;
}

function ensureExecutable(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // ignore chmod errors on non-posix filesystems
  }
}

function ensurePrivate(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore chmod errors on non-posix filesystems
  }
}

async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const originalWrite = (rl as any)._writeToOutput;
  (rl as any)._writeToOutput = function writeToOutput(stringToWrite: string) {
    if ((rl as any).stdoutMuted) return;
    if (typeof originalWrite === "function") {
      originalWrite.call(this, stringToWrite);
    } else {
      (rl as any).output.write(stringToWrite);
    }
  };
  (rl as any).stdoutMuted = true;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      (rl as any).stdoutMuted = false;
      rl.close();
      resolve(answer);
    });
  });
}

async function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
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

function resolveAuthMode(config: Record<string, string>, args: InstallArgs): "token" | "global" {
  const explicit = args["yapi-auth-mode"];
  if (explicit === "token" || explicit === "global") return explicit;

  if (args["yapi-token"] || config.token) return "token";
  if (args["yapi-email"] || args["yapi-password"] || config.email || config.password) return "global";

  return "global";
}

export async function runInstallSkill(rawArgs: string[]): Promise<void> {
  const argv = yargs(rawArgs)
    .options({
      "yapi-base-url": { type: "string", describe: "YApi base URL" },
      "yapi-token": { type: "string", describe: "YApi project token" },
      "yapi-auth-mode": { type: "string", choices: ["token", "global"], describe: "Auth mode" },
      "yapi-email": { type: "string", describe: "Login email for global auth" },
      "yapi-password": { type: "string", describe: "Login password for global auth" },
      "project-id": { type: "string", describe: "Select project token by id" },
      "yapi-home": { type: "string", describe: "Override YApi config home (default: ~/.yapi)" },
      "codex-home": { type: "string", describe: "Override CODEX_HOME" },
      "claude-home": { type: "string", describe: "Override Claude home (default: ~/.claude)" },
      force: { type: "boolean", default: false, describe: "Overwrite skill files if they already exist" },
    })
    .help()
    .parseSync() as InstallArgs;

  const yapiHome = argv["yapi-home"] || process.env.YAPI_HOME || path.join(os.homedir(), ".yapi");
  const codexHome = argv["codex-home"] || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const claudeHome = argv["claude-home"] || process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
  const globalConfigPath = path.join(yapiHome, "config.toml");
  const targets = [
    { label: "Codex", root: path.join(codexHome, "skills", SKILL_NAME) },
    { label: "Claude", root: path.join(claudeHome, "skills", SKILL_NAME) },
  ];
  const seenRoots = new Set<string>();
  const uniqueTargets = targets.filter((target) => {
    if (seenRoots.has(target.root)) return false;
    seenRoots.add(target.root);
    return true;
  });

  let existingConfig: Record<string, string> = {};
  if (fs.existsSync(globalConfigPath)) {
    existingConfig = parseSimpleToml(fs.readFileSync(globalConfigPath, "utf8"));
  } else {
    for (const target of uniqueTargets) {
      const configPath = path.join(target.root, "config.toml");
      if (fs.existsSync(configPath)) {
        existingConfig = parseSimpleToml(fs.readFileSync(configPath, "utf8"));
        break;
      }
    }
  }

  const merged = { ...existingConfig };
  if (argv["yapi-base-url"] || process.env.YAPI_BASE_URL) {
    merged.base_url = argv["yapi-base-url"] || process.env.YAPI_BASE_URL || "";
  }
  if (argv["yapi-token"] || process.env.YAPI_TOKEN) {
    merged.token = argv["yapi-token"] || process.env.YAPI_TOKEN || "";
  }
  if (argv["project-id"] || process.env.YAPI_PROJECT_ID) {
    merged.project_id = argv["project-id"] || process.env.YAPI_PROJECT_ID || "";
  }

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

  if (!merged.base_url && isInteractive) {
    merged.base_url = await promptRequired("YApi base URL: ", false);
  }
  if (!merged.base_url) {
    throw new Error("Missing --yapi-base-url or YAPI_BASE_URL; cannot write config.");
  }

  const authMode = resolveAuthMode(merged, argv);
  merged.auth_mode = authMode;

  if (argv["yapi-email"] || process.env.YAPI_EMAIL) {
    merged.email = argv["yapi-email"] || process.env.YAPI_EMAIL || "";
  }

  let password = argv["yapi-password"] || process.env.YAPI_PASSWORD || merged.password || "";
  if (authMode === "global") {
    if (!merged.email && isInteractive) {
      merged.email = await promptRequired("YApi email: ", false);
    }
    if (!merged.email) {
      merged.email = PLACEHOLDER_EMAIL;
    }
    if (!password && isInteractive) {
      password = await promptRequired("YApi password: ", true);
    }
    if (!password) {
      password = merged.password || PLACEHOLDER_PASSWORD;
      console.warn("Warning: password not provided; writing placeholder to config.");
    }
  }
  merged.password = password;

  const installedRoots: string[] = [];
  const configPaths: string[] = [];

  fs.mkdirSync(yapiHome, { recursive: true });
  fs.writeFileSync(globalConfigPath, formatToml(merged), "utf8");
  ensurePrivate(globalConfigPath);
  configPaths.push(globalConfigPath);

  for (const target of uniqueTargets) {
    const scriptsDir = path.join(target.root, "scripts");
    const configPath = path.join(target.root, "config.toml");
    const skillPath = path.join(target.root, "SKILL.md");
    const scriptPath = path.join(scriptsDir, "yapi_request.js");

    fs.mkdirSync(scriptsDir, { recursive: true });

    writeFileIfNeeded(skillPath, SKILL_MD, argv.force ?? false);
    const scriptWritten = writeFileIfNeeded(scriptPath, REQUEST_SCRIPT, argv.force ?? false);
    if (scriptWritten) ensureExecutable(scriptPath);

    fs.writeFileSync(configPath, formatToml(merged), "utf8");
    ensurePrivate(configPath);

    installedRoots.push(`${target.label}: ${target.root}`);
    configPaths.push(configPath);
  }

  console.log(`Installed skill '${SKILL_NAME}' at:`);
  installedRoots.forEach((entry) => console.log(`- ${entry}`));
  console.log("Config written to:");
  configPaths.forEach((entry) => console.log(`- ${entry}`));
  console.log("Restart Codex/Claude Code to pick up new skills.");
}
