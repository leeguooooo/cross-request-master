import fs from "fs";
import type { Options } from "../types";
import {
  globalConfigPath,
  parseSimpleToml,
  promptRequired,
  writeConfig,
} from "../utils";

function resolveAuthMode(
  explicit: string,
  existing: Record<string, string>,
  merged: Record<string, string>,
): "token" | "global" | null {
  const normalized = String(explicit || existing.auth_mode || "").trim().toLowerCase();
  if (!normalized) {
    return merged.token ? "token" : "global";
  }
  if (normalized === "token" || normalized === "global") return normalized;
  return null;
}

export async function runConfig(action: string, options: Options): Promise<number> {
  const normalizedAction = String(action || "init").trim().toLowerCase() || "init";
  if (normalizedAction !== "init") {
    console.error(`unknown config action: ${normalizedAction}`);
    return 2;
  }

  const configPath = options.config || globalConfigPath();
  const existing = fs.existsSync(configPath)
    ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
    : {};
  const merged: Record<string, string> = { ...existing };

  if (options.baseUrl !== undefined) merged.base_url = options.baseUrl;
  if (options.email !== undefined) merged.email = options.email;
  if (options.password !== undefined) merged.password = options.password;
  if (options.token !== undefined) merged.token = options.token;
  if (options.projectId !== undefined) merged.project_id = options.projectId;

  if (!merged.base_url) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("missing --base-url");
      return 2;
    }
    merged.base_url = await promptRequired("YApi base URL: ", false);
  }

  const authMode = resolveAuthMode(options.authMode || "", existing, merged);
  if (!authMode) {
    console.error("invalid --auth-mode (use token or global)");
    return 2;
  }

  merged.auth_mode = authMode;
  merged.email = merged.email || "";
  merged.password = merged.password || "";
  merged.token = merged.token || "";
  merged.project_id = merged.project_id || "";

  writeConfig(configPath, merged);

  console.log(`Config written to: ${configPath}`);
  if (authMode === "global" && !merged.password) {
    console.log(
      "Global auth configured without saved password. Run `yapi login --base-url <url> --browser` once to sync cookie, or rerun with --password to enable password relogin.",
    );
  }
  if (authMode === "token" && !merged.token) {
    console.log("Token mode configured without token. Pass --token now or set it later before requests.");
  }
  return 0;
}
