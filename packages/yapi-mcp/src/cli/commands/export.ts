import fs from "fs";
import type { Options } from "../types";
import {
  globalConfigPath,
  parseSimpleToml,
  resolveToken,
} from "../utils";
import { buildUrl, fetchWithTimeout } from "../http";
import { YApiAuthService } from "../../services/yapi/auth";

export async function runExport(options: Options): Promise<number> {
  const configPath = options.config || globalConfigPath();
  const config = fs.existsSync(configPath)
    ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
    : {};

  const baseUrl = options.baseUrl || config.base_url || "";
  if (!baseUrl) {
    console.error("missing --base-url or config base_url");
    return 2;
  }

  const projectId = String(options.projectId || options.id || config.project_id || "").trim();
  if (!projectId) {
    console.error("missing --project-id for export");
    return 2;
  }

  const format = (options.type || "json").toLowerCase();
  if (!["json", "swagger", "html"].includes(format)) {
    console.error("invalid --type: must be json, swagger, or html");
    return 2;
  }

  const status = (options.q || "all").toLowerCase();
  const output = options.name || `yapi-export-${projectId}.${format === "swagger" ? "html" : format}`;

  // Resolve auth
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

  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  if (!headers.Cookie && authMode === "global") {
    const email = options.email || config.email || "";
    const password = options.password || config.password || "";
    const authService = new YApiAuthService(baseUrl, email, password, "warn", {
      timeoutMs: options.timeout || 30000,
    });
    const cachedCookie = authService.getCachedCookieHeader();
    if (cachedCookie) {
      headers.Cookie = cachedCookie;
    } else if (email && password) {
      try {
        headers.Cookie = await authService.getCookieHeaderWithLogin();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 2;
      }
    }
  }

  const queryItems: [string, string][] = [
    ["type", format],
    ["pid", projectId],
    ["status", status],
    ["isWiki", "false"],
  ];

  const url = buildUrl(
    baseUrl,
    "/api/plugin/export",
    queryItems,
    authMode === "token" ? token : "",
    options.tokenParam || "token",
  );

  try {
    const response = await fetchWithTimeout(url, { method: "GET", headers }, options.timeout || 30000);
    const text = await response.text();

    fs.writeFileSync(output, text, "utf8");
    console.log(`exported ${format} → ${output} (${text.length} bytes)`);
    return 0;
  } catch (error) {
    console.error("export failed: " + (error instanceof Error ? error.message : String(error)));
    return 2;
  }
}
