import fs from "fs";
import type { Options, SimpleRequestQueryBuilder } from "./types";
import {
  globalConfigPath,
  looksLikeAuthError,
  parseJsonMaybe,
  parseSimpleToml,
  resolveToken,
} from "./utils";
import { buildUrl, fetchWithTimeout } from "./http";
import { YApiAuthService } from "../services/yapi/auth";

export async function runSimpleRequest(
  options: Options,
  endpoint: string,
  requireBaseUrl: boolean,
  buildQueryItems?: SimpleRequestQueryBuilder,
  transform?: (payload: unknown, options: Options) => unknown,
): Promise<number> {
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
  let method: "GET" | "POST" = "GET";
  let data: unknown = undefined;
  if (buildQueryItems) {
    const result = buildQueryItems(options);
    if (!result.ok) return 2;
    queryItems = result.queryItems || [];
    if (result.method) {
      method = result.method;
    }
    if (result.data !== undefined) {
      data = result.data;
    }
  }

  const url = buildUrl(
    baseUrl,
    endpoint,
    queryItems,
    authMode === "token" ? token : "",
    options.tokenParam || "token",
  );

  const sendOnce = async () => {
    let body: string | undefined;
    const requestHeaders: Record<string, string> = { ...headers };
    if (data !== undefined) {
      body = JSON.stringify(data);
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
    const nextPayload = transform ? transform(payload, options) : payload;
    console.log(JSON.stringify(nextPayload ?? payload, null, 2));
  } catch {
    console.log(text);
  }
  return 0;
}
