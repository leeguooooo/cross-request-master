import type { Options } from "../types";
import { runSimpleRequest } from "../simple-request";

export async function runGroup(action: string, options: Options): Promise<number> {
  if (action === "list") {
    return await runSimpleRequest(options, "/api/group/list", true);
  }
  if (action === "get") {
    return await runSimpleRequest(
      options,
      "/api/group/get",
      true,
      (opts) => {
        const id = String(opts.id || "").trim();
        if (!id) {
          console.error("missing --id for group get");
          return { ok: false };
        }
        return { ok: true, queryItems: [["id", id]] };
      },
    );
  }

  console.error(`unknown group action: ${action}`);
  return 2;
}
