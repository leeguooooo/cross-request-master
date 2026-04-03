import type { Options } from "../types";
import { runSimpleRequest } from "../simple-request";

export async function runWhoami(options: Options): Promise<number> {
  return await runSimpleRequest(options, "/api/user/status", true);
}
