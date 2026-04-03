import type { Options } from "../types";
import { runSimpleRequest } from "../simple-request";

export async function runFollow(options: Options): Promise<number> {
  return await runSimpleRequest(options, "/api/follow/list", true);
}
