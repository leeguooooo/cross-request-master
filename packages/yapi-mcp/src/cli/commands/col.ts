import type { Options } from "../types";
import { resolveToken, globalConfigPath, parseSimpleToml } from "../utils";
import { runSimpleRequest } from "../simple-request";
import { buildUrl, fetchWithTimeout } from "../http";
import fs from "fs";

export async function runCol(action: string, options: Options): Promise<number> {
  if (action === "list") {
    return await runSimpleRequest(
      options,
      "/api/col/list",
      true,
      (opts) => {
        const projectId = String(opts.projectId || "").trim();
        if (!projectId) {
          console.error("missing --project-id for col list");
          return { ok: false };
        }
        return { ok: true, queryItems: [["project_id", projectId]] };
      },
    );
  }

  if (action === "cases" || action === "case-list" || action === "case_list") {
    return await runSimpleRequest(
      options,
      "/api/col/case_list",
      true,
      (opts) => {
        const colId = String(opts.id || "").trim();
        if (!colId) {
          console.error("missing --id (col id) for col cases");
          return { ok: false };
        }
        return { ok: true, queryItems: [["col_id", colId]] };
      },
    );
  }

  if (action === "run") {
    const configPath = options.config || globalConfigPath();
    const config = fs.existsSync(configPath)
      ? parseSimpleToml(fs.readFileSync(configPath, "utf8"))
      : {};

    const baseUrl = options.baseUrl || config.base_url || "";
    if (!baseUrl) {
      console.error("missing --base-url or config base_url");
      return 2;
    }

    const colId = String(options.id || "").trim();
    if (!colId) {
      console.error("missing --id (col id) for col run");
      return 2;
    }

    const projectId = options.projectId || config.project_id || "";
    const rawToken = options.token || config.token || "";
    const token = resolveToken(rawToken, projectId);
    if (!token) {
      console.error("missing --token for col run (requires project token, not cookie auth)");
      return 2;
    }

    const url = buildUrl(baseUrl, "/api/open/run_auto_test", [["id", colId]], token, options.tokenParam || "token");

    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, options.timeout || 30000);
      const text = await response.text();
      if (options.noPretty) {
        console.log(text);
      } else {
        try {
          const payload = JSON.parse(text);
          console.log(JSON.stringify(payload, null, 2));
        } catch {
          console.log(text);
        }
      }
      return 0;
    } catch (error) {
      console.error("request failed: " + (error instanceof Error ? error.message : String(error)));
      return 2;
    }
  }

  console.error(`unknown col action: ${action || "(missing)"}`);
  return 2;
}
