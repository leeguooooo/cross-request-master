import type { Options } from "../types";
import { resolveLimit } from "../utils";
import { runSimpleRequest } from "../simple-request";

export async function runUser(action: string, options: Options): Promise<number> {
  if (action === "list") {
    return await runSimpleRequest(
      options,
      "/api/user/list",
      true,
      (opts) => {
        const page = Number.isFinite(opts.page ?? NaN) ? String(opts.page) : "1";
        const limit = resolveLimit(opts.limit, "20");
        return { ok: true, queryItems: [["page", page], ["limit", limit]] };
      },
    );
  }

  if (action === "search") {
    return await runSimpleRequest(
      options,
      "/api/user/search",
      true,
      (opts) => {
        const q = String(opts.q || opts.name || "").trim();
        if (!q) {
          console.error("missing --q for user search");
          return { ok: false };
        }
        return { ok: true, queryItems: [["q", q]] };
      },
    );
  }

  console.error(`unknown user action: ${action || "(missing, use list or search)"}`);
  return 2;
}
