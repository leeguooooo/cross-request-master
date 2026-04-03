import type { Options } from "../types";
import { runSimpleRequest } from "../simple-request";

export async function runMember(action: string, options: Options): Promise<number> {
  if (action === "list" || action === "project") {
    const projectId = String(options.projectId || options.id || "").trim();
    if (!projectId) {
      console.error("missing --project-id for member list");
      return 2;
    }
    return await runSimpleRequest(
      options,
      "/api/project/get_member_list",
      true,
      () => ({ ok: true, queryItems: [["id", projectId]] }),
    );
  }

  if (action === "group") {
    const groupId = String(options.groupId || options.id || "").trim();
    if (!groupId) {
      console.error("missing --group-id for member group");
      return 2;
    }
    return await runSimpleRequest(
      options,
      "/api/group/get_member_list",
      true,
      () => ({ ok: true, queryItems: [["id", groupId]] }),
    );
  }

  console.error(`unknown member action: ${action || "(missing, use list or group)"}`);
  return 2;
}
