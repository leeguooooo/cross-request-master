import type { Options } from "../types";
import { resolveLimit } from "../utils";
import { runSimpleRequest } from "../simple-request";

export async function runProject(action: string, options: Options): Promise<number> {
  if (action === "list") {
    return await runSimpleRequest(
      options,
      "/api/project/list",
      true,
      (opts) => {
        const groupId = String(opts.groupId || "").trim();
        if (!groupId) {
          console.error("missing --group-id for project list");
          return { ok: false };
        }
        const page = Number.isFinite(opts.page ?? NaN) ? String(opts.page) : "1";
        const limit = resolveLimit(opts.limit, "10");
        return {
          ok: true,
          queryItems: [
            ["group_id", groupId],
            ["page", page],
            ["limit", limit],
          ],
        };
      },
    );
  }
  if (action === "get") {
    return await runSimpleRequest(
      options,
      "/api/project/get",
      true,
      (opts) => {
        const id = String(opts.id || "").trim();
        if (!id) {
          console.error("missing --id for project get");
          return { ok: false };
        }
        return { ok: true, queryItems: [["id", id]] };
      },
    );
  }
  if (action === "token") {
    return await runSimpleRequest(
      options,
      "/api/project/token",
      true,
      (opts) => {
        const projectId = String(opts.projectId || opts.id || "").trim();
        if (!projectId) {
          console.error("missing --project-id for project token");
          return { ok: false };
        }
        return { ok: true, queryItems: [["project_id", projectId]] };
      },
    );
  }

  console.error(`unknown project action: ${action}`);
  return 2;
}
