import fs from "fs";
import type { Options } from "../types";
import {
  globalConfigPath,
  loginByBrowserAndReadCookie,
  parseSimpleToml,
  promptRequired,
  writeConfig,
} from "../utils";
import { YApiAuthService } from "../../services/yapi/auth";
import { YApiAuthCache } from "../../services/yapi/authCache";

export async function runLogin(options: Options): Promise<number> {
  const configPath = options.config || globalConfigPath();
  const config = fs.existsSync(configPath)
    ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
    : {};

  let baseUrl = options.baseUrl || config.base_url || "";
  let email = options.email || config.email || "";
  let password = options.password || config.password || "";
  const projectId = options.projectId || config.project_id || "";
  const token = options.token || config.token || "";
  let updated = false;

  if (!baseUrl) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("missing --base-url or config base_url");
      return 2;
    }
    baseUrl = await promptRequired("YApi base URL: ", false);
    updated = true;
  }

  const useBrowserLogin = Boolean(options.browser) || !email || !password;
  if (useBrowserLogin) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("browser login requires interactive terminal");
      return 2;
    }

    try {
      const session = await loginByBrowserAndReadCookie(baseUrl, options.loginUrl);
      const cache = new YApiAuthCache(baseUrl, "warn");
      cache.saveSession({
        yapiToken: session.yapiToken,
        yapiUid: session.yapiUid,
        expiresAt: session.expiresAt,
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }

    const shouldWriteConfig = updated || !fs.existsSync(configPath) || config.auth_mode !== "global";
    if (shouldWriteConfig) {
      const mergedConfig: Record<string, string> = {
        base_url: baseUrl,
        auth_mode: "global",
        email,
        password,
        token,
        project_id: projectId,
      };
      writeConfig(configPath, mergedConfig);
    }

    console.log("login success (cookie synced from browser to ~/.yapi-mcp/auth-*.json)");
    return 0;
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

  const shouldWriteConfig = updated || !fs.existsSync(configPath) || config.auth_mode !== "global";
  if (shouldWriteConfig) {
    const mergedConfig: Record<string, string> = {
      base_url: baseUrl,
      auth_mode: "global",
      email,
      password,
      token,
      project_id: projectId,
    };
    writeConfig(configPath, mergedConfig);
  }

  console.log("login success (cookie cached in ~/.yapi-mcp/auth-*.json)");
  return 0;
}
