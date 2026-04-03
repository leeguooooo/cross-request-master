import fs from "fs";
import type { Options } from "../types";
import { globalConfigPath, parseSimpleToml } from "../utils";
import { YApiAuthCache } from "../../services/yapi/authCache";

export async function runLogout(options: Options): Promise<number> {
  const configPath = options.config || globalConfigPath();
  const config = fs.existsSync(configPath)
    ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
    : {};

  const baseUrl = options.baseUrl || config.base_url || "";
  if (!baseUrl) {
    console.error("missing --base-url or config base_url");
    return 2;
  }

  const cache = new YApiAuthCache(baseUrl, "warn");
  cache.clearSession();
  console.log("logout success (session cleared from ~/.yapi-mcp/auth-*.json)");
  return 0;
}
