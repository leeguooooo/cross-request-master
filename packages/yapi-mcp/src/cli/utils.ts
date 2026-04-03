import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import type {
  AgentBrowserCookie,
  ConfigInitOptions,
  DocsSyncOptions,
  DocsSyncProjectEnv,
  UpdateCache,
} from "./types";

export function parseKeyValue(raw: string): [string, string] {
  if (!raw || !raw.includes("=")) throw new Error("expected key=value");
  const idx = raw.indexOf("=");
  return [raw.slice(0, idx), raw.slice(idx + 1)];
}

export function parseQueryArg(raw: string): [string, string][] {
  const trimmed = String(raw || "").trim().replace(/^\?/, "");
  if (!trimmed) throw new Error("expected key=value");
  if (!trimmed.includes("&")) return [parseKeyValue(trimmed)];
  const items = Array.from(new URLSearchParams(trimmed).entries()).filter(([key]) => Boolean(key));
  if (items.length) return items;
  return [parseKeyValue(trimmed)];
}

export function parseHeader(raw: string): [string, string] {
  if (!raw || !raw.includes(":")) throw new Error("expected Header:Value");
  const idx = raw.indexOf(":");
  return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
}

export function parseJsonMaybe(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[index]}`;
}

export function parseByteSize(raw: string): number | null {
  const text = String(raw || "");
  const bytesMatch = text.match(/(\d+)\s*bytes?/i);
  if (bytesMatch) return Number(bytesMatch[1]);
  const unitMatch = text.match(/(\d+(?:\.\d+)?)\s*(kib|kb|mib|mb|gib|gb)\b/i);
  if (!unitMatch) return null;
  const value = Number(unitMatch[1]);
  if (!Number.isFinite(value)) return null;
  const unit = unitMatch[2].toLowerCase();
  const factors: Record<string, number> = {
    kb: 1000,
    kib: 1024,
    mb: 1000 * 1000,
    mib: 1024 * 1024,
    gb: 1000 * 1000 * 1000,
    gib: 1024 * 1024 * 1024,
  };
  return Math.round(value * (factors[unit] || 1));
}

export function parsePayloadLimit(text: string): number | null {
  const match = String(text || "").match(
    /(?:limit|max(?:imum)?(?:\s+body)?(?:\s+size)?)[^0-9]{0,12}(\d+(?:\.\d+)?\s*(?:bytes?|kib|kb|mib|mb|gib|gb))/i,
  );
  if (match) return parseByteSize(match[1]);
  return parseByteSize(text);
}

export function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, ".git");
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function getPayloadMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const message = record.errmsg ?? record.message ?? record.msg;
  return typeof message === "string" ? message : "";
}

export function getPayloadErrcode(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const code = Number(record.errcode ?? record.code ?? record.errCode);
  return Number.isFinite(code) ? code : null;
}

export function looksLikeAuthError(status: number, payload: unknown): boolean {
  if (status === 401 || status === 403) return true;
  const code = getPayloadErrcode(payload);
  if (code !== null && [40011, 40012, 40013, 401, 403].includes(code)) return true;
  const message = getPayloadMessage(payload);
  if (!message) return false;
  return /登录|login|权限|unauthori|forbidden|not\s*login|no\s*permission/i.test(message);
}

export function joinUrl(baseUrl: string, endpoint: string): string {
  if (!baseUrl) return endpoint;
  if (baseUrl.endsWith("/") && endpoint.startsWith("/")) return baseUrl.slice(0, -1) + endpoint;
  if (!baseUrl.endsWith("/") && !endpoint.startsWith("/")) return baseUrl + "/" + endpoint;
  return baseUrl + endpoint;
}

export function globalConfigPath(): string {
  const yapiHome = process.env.YAPI_HOME || path.join(os.homedir(), ".yapi");
  return path.join(yapiHome, "config.toml");
}

export function parseSimpleToml(text: string): Record<string, string> {
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

export function resolveToken(tokenValue: string, projectId: string): string {
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

export function resolveLocalBin(binName: string): string {
  const baseName = process.platform === "win32" ? `${binName}.cmd` : binName;
  const localBin = path.resolve(__dirname, "..", "..", "node_modules", ".bin", baseName);
  if (fs.existsSync(localBin)) return localBin;
  return binName;
}

export function parseJsonLoose(text: string): unknown | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const direct = parseJsonMaybe(raw);
  if (direct !== null) return direct;

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = parseJsonMaybe(lines[i]);
    if (parsed !== null) return parsed;
  }

  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  const starts = [firstBrace, firstBracket].filter((n) => n >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const lastBrace = raw.lastIndexOf("}");
  const lastBracket = raw.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end <= start) return null;

  const sliced = raw.slice(start, end + 1);
  return parseJsonMaybe(sliced);
}

export function extractCookiesFromPayload(payload: unknown): AgentBrowserCookie[] {
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      if (current.every((item) => item && typeof item === "object")) {
        return current as AgentBrowserCookie[];
      }
      continue;
    }
    if (typeof current !== "object") continue;

    const obj = current as Record<string, unknown>;
    if (Array.isArray(obj.cookies)) return obj.cookies as AgentBrowserCookie[];
    if (Array.isArray(obj.data)) return obj.data as AgentBrowserCookie[];
    if (obj.data && typeof obj.data === "object") queue.push(obj.data);
    if (obj.result && typeof obj.result === "object") queue.push(obj.result);
    if (obj.payload && typeof obj.payload === "object") queue.push(obj.payload);
  }

  return [];
}

export function normalizeCookieExpiresMs(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n > 1_000_000_000_000 ? n : n * 1000;
}

export function runAgentBrowser(
  args: string[],
  options: { captureOutput?: boolean; ignoreError?: boolean } = {},
): string {
  const bins = [
    resolveLocalBin("agent-browser-stealth"),
    resolveLocalBin("agent-browser"),
    "agent-browser-stealth",
    "agent-browser",
  ];
  const uniq = Array.from(new Set(bins));
  let lastError: unknown = null;

  for (const bin of uniq) {
    try {
      if (options.captureOutput) {
        const output = execFileSync(bin, args, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return String(output || "");
      }
      execFileSync(bin, args, { stdio: "inherit" });
      return "";
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        lastError = error;
        continue;
      }
      if (options.ignoreError) return "";
      throw error;
    }
  }

  if ((lastError as { code?: string } | null)?.code === "ENOENT") {
    throw new Error(
      "未找到 agent-browser-stealth。请先执行: pnpm -C packages/yapi-mcp add agent-browser-stealth && pnpm -C packages/yapi-mcp exec agent-browser-stealth install",
    );
  }
  throw new Error("启动 agent-browser-stealth 失败");
}

export async function loginByBrowserAndReadCookie(
  baseUrl: string,
  loginUrlOption: string | undefined,
): Promise<{ yapiToken: string; yapiUid?: string; expiresAt?: number }> {
  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
  const defaultLoginUrl = normalizedBase;

  let loginUrl = String(loginUrlOption || "").trim();
  if (!loginUrl) {
    const answer = await promptText(`YApi page URL [${defaultLoginUrl}]: `);
    loginUrl = answer.trim() || defaultLoginUrl;
  }
  try {
    const parsed = new URL(loginUrl);
    loginUrl = parsed.toString();
  } catch {
    throw new Error(`invalid login url: ${loginUrl}`);
  }

  const sessionName = `yapi-login-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  console.log(`opening browser for login: ${loginUrl}`);
  console.log(`browser session name: ${sessionName}`);
  runAgentBrowser(["open", loginUrl, "--headed", "--session-name", sessionName]);

  await promptText("请在浏览器完成登录，然后按回车继续...");

  let cookies: AgentBrowserCookie[] = [];
  try {
    const output = runAgentBrowser(["cookies", "--json", "--session-name", sessionName], {
      captureOutput: true,
    });
    const payload = parseJsonLoose(output);
    cookies = extractCookiesFromPayload(payload);
  } finally {
    runAgentBrowser(["close", "--session-name", sessionName], { ignoreError: true });
  }
  if (!cookies.length) {
    throw new Error(
      `未读取到浏览器 cookie。请确认登录完成后再回车；如果仍失败，请先自检:\nagent-browser-stealth cookies --json --session-name ${sessionName}`,
    );
  }

  const tokenCookie = cookies.find((item) => String(item?.name || "") === "_yapi_token");
  const uidCookie = cookies.find((item) => String(item?.name || "") === "_yapi_uid");
  const yapiToken = String(tokenCookie?.value || "").trim();
  if (!yapiToken) {
    throw new Error("未找到 _yapi_token，请确认登录站点是目标 YApi 域名");
  }

  const yapiUid = String(uidCookie?.value || "").trim() || undefined;
  const expiresAt =
    normalizeCookieExpiresMs(tokenCookie?.expiresAt) ?? normalizeCookieExpiresMs(tokenCookie?.expires);
  return { yapiToken, yapiUid, expiresAt };
}

export function escapeTomlValue(value: string): string {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

export function formatToml(config: Record<string, string>): string {
  const orderedKeys = ["base_url", "auth_mode", "email", "password", "token", "project_id"];
  const lines = ["# YApi CLI config"];
  for (const key of orderedKeys) {
    const value = config[key] || "";
    lines.push(`${key} = "${escapeTomlValue(value)}"`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeConfig(filePath: string, config: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, formatToml(config), "utf8");
}

export function promptText(question: string): Promise<string> {
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

export function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const output = (rl as unknown as { output?: NodeJS.WritableStream }).output || process.stdout;
  const originalWrite = (rl as unknown as { _writeToOutput?: (value: string) => void })
    ._writeToOutput;
  if (question) {
    output.write(question);
  }
  (rl as unknown as { stdoutMuted?: boolean }).stdoutMuted = true;
  (rl as unknown as { _writeToOutput?: (value: string) => void })._writeToOutput =
    function writeToOutput(value: string) {
      if ((rl as unknown as { stdoutMuted?: boolean }).stdoutMuted) return;
      if (typeof originalWrite === "function") {
        originalWrite.call(this, value);
      } else {
        output.write(value);
      }
    };
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      (rl as unknown as { stdoutMuted?: boolean }).stdoutMuted = false;
      if (question) {
        output.write("\n");
      }
      rl.close();
      resolve(answer);
    });
  });
}

export async function promptRequired(question: string, hidden: boolean): Promise<string> {
  while (true) {
    const answer = hidden ? await promptHidden(question) : await promptText(question);
    const trimmed = String(answer || "").trim();
    if (trimmed) return trimmed;
  }
}

export async function initConfigIfMissing(
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

export function readVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export function resolveLimit(value: number | string | undefined, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  if (Number.isFinite(value ?? NaN)) {
    return String(value);
  }
  return fallback;
}

export function buildDocsSyncHash(markdown: string, options: DocsSyncOptions): string {
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
  hash.update(markdown);
  return hash.digest("hex");
}

export const UPDATE_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

export function updateCachePath(): string {
  const yapiHome = process.env.YAPI_HOME || path.join(os.homedir(), ".yapi");
  return path.join(yapiHome, "update.json");
}

export function readUpdateCache(): UpdateCache {
  try {
    const cachePath = updateCachePath();
    if (!fs.existsSync(cachePath)) return {};
    const raw = fs.readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as UpdateCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeUpdateCache(cache: UpdateCache): void {
  try {
    const cachePath = updateCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // ignore cache failures
  }
}

export function compareSemver(a: string, b: string): number {
  const toParts = (value: string) =>
    String(value || "")
      .trim()
      .split(".")
      .map((part) => Number(part.replace(/\D/g, "")) || 0);
  const aParts = toParts(a);
  const bParts = toParts(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0;
}

export function normalizeUiBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
}

export function buildInterfaceWebUrl(
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

export function normalizePathSegment(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  const noTrailing = trimmed.replace(/\/+$/, "");
  return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
}

export function buildEnvUrl(domain: string, basepath: string, apiPath: string): string {
  const base = String(domain || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return "";
  const normalizedBasepath = normalizePathSegment(basepath);
  const normalizedPath = normalizePathSegment(apiPath);
  return `${base}${normalizedBasepath}${normalizedPath}`;
}

export function normalizeProjectEnvs(raw: unknown): DocsSyncProjectEnv[] {
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
