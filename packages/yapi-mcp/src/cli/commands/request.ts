import fs from "fs";
import type { Options } from "../types";
import {
  globalConfigPath,
  initConfigIfMissing,
  looksLikeAuthError,
  parseHeader,
  parseJsonMaybe,
  parseQueryArg,
  parseSimpleToml,
  resolveToken,
} from "../utils";
import { buildUrl, fetchWithTimeout } from "../http";
import { YApiAuthService } from "../../services/yapi/auth";

export async function runRequest(options: Options): Promise<number> {
  if (options.url && options.path) {
    console.error("use --url or --path, not both");
    return 2;
  }

  if (!options.url && !options.path) {
    console.error("missing --path or --url");
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
    queryItems.push(...parseQueryArg(query));
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
