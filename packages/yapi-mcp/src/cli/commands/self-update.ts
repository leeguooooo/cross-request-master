import { execFileSync } from "child_process";
import { resolveLocalBin } from "../utils";

export function runSelfUpdate(): number {
  try {
    execFileSync(resolveLocalBin("npm"), ["install", "-g", "@leeguoo/yapi-mcp@latest"], {
      stdio: "inherit",
    });
    console.log("Updated yapi CLI to latest.");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
