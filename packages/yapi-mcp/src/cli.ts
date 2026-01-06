#!/usr/bin/env node

import { resolve } from "path";
import { config } from "dotenv";
import { startServer } from "./index";
import { runInstallSkill } from "./skill/install";

// Load .env from the current working directory
config({ path: resolve(process.cwd(), ".env") });

const [command, ...restArgs] = process.argv.slice(2);

if (command === "install-skill") {
  runInstallSkill(restArgs).catch((error: unknown) => {
    if (error instanceof Error) {
      console.error("Skill install failed:", error.message);
    } else {
      console.error("Skill install failed with unknown error:", error);
    }
    process.exit(1);
  });
} else {
  startServer().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error("Failed to start server:", error.message);
    } else {
      console.error("Failed to start server with unknown error:", error);
    }
    process.exit(1);
  });
}
