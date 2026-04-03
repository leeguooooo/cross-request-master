import type { Options } from "../types";
import { runSimpleRequest } from "../simple-request";

export async function runEnv(options: Options): Promise<number> {
  const projectId = String(options.projectId || options.id || "").trim();
  if (!projectId) {
    console.error("missing --project-id for env");
    return 2;
  }
  return await runSimpleRequest(
    options,
    "/api/project/get_env",
    true,
    () => ({ ok: true, queryItems: [["project_id", projectId]] }),
  );
}
