import type { Options } from "../types";
import { resolveLimit } from "../utils";
import { runSimpleRequest } from "../simple-request";

export async function runLog(action: string, options: Options): Promise<number> {
  if (action === "list") {
    return await runSimpleRequest(
      options,
      "/api/log/list",
      true,
      (opts) => {
        const type = String(opts.type || "").trim();
        const typeId = String(opts.typeId || "").trim();
        if (!type || !typeId) {
          console.error("missing --type/--type-id for log list");
          return { ok: false };
        }
        const page = Number.isFinite(opts.page ?? NaN) ? String(opts.page) : "1";
        const limit = resolveLimit(opts.limit, "10");
        return {
          ok: true,
          queryItems: [
            ["type", type],
            ["typeid", typeId],
            ["page", page],
            ["limit", limit],
          ],
        };
      },
    );
  }

  console.error(`unknown log action: ${action}`);
  return 2;
}
