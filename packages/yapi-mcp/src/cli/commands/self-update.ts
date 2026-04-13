import { execFileSync } from "child_process";
import { isNewerVersion, readVersion, resolveLocalBin } from "../utils";

const PACKAGE_NAME = "@leeguoo/yapi-mcp";

type PackageManager = {
  bin: string;
  installArgs: (pkg: string) => string[];
  viewArgs: (pkg: string) => string[];
};

type DetectPackageManagerOptions = {
  dirnameHint?: string;
  bunVersion?: string | undefined;
};

function createPackageManager(
  bin: string,
  installArgs: (pkg: string) => string[],
  viewArgs?: (pkg: string) => string[],
): PackageManager {
  return {
    bin,
    installArgs,
    viewArgs:
      viewArgs ||
      ((pkg: string) => ["view", pkg, "version", "--json"]),
  };
}

export function detectPackageManager(options: DetectPackageManagerOptions = {}): PackageManager {
  const dirnameHint = String(options.dirnameHint || __dirname).toLowerCase();
  const npmExecPath = String(process.env.npm_execpath || "").toLowerCase();

  if (npmExecPath.includes("pnpm")) {
    return createPackageManager("pnpm", (pkg) => ["add", "-g", pkg]);
  }
  if (dirnameHint.includes(".pnpm") || dirnameHint.includes("pnpm")) {
    return createPackageManager("pnpm", (pkg) => ["add", "-g", pkg]);
  }
  if (dirnameHint.includes("yarn")) {
    return createPackageManager(
      "yarn",
      (pkg) => ["global", "add", pkg],
      (pkg) => ["view", pkg, "version", "--json"],
    );
  }
  if (options.bunVersion ?? process.versions.bun) {
    return createPackageManager(
      "bun",
      (pkg) => ["install", "-g", pkg],
      (pkg) => ["view", pkg, "version", "--json"],
    );
  }
  return createPackageManager("npm", (pkg) => ["install", "-g", pkg]);
}

function parsePublishedVersion(output: string): string | null {
  const trimmed = String(output || "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as string | { version?: string };
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object" && typeof parsed.version === "string") {
      return parsed.version;
    }
  } catch {
    return trimmed.replace(/^"|"$/g, "");
  }
  return null;
}

function execPackageManagerView(bin: string, args: string[]): string | null {
  const output = execFileSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parsePublishedVersion(output);
}

function readLatestPublishedVersion(manager: PackageManager): string | null {
  const primaryBin = resolveLocalBin(manager.bin);
  const npmBin = resolveLocalBin("npm");
  const viewArgs = manager.viewArgs(PACKAGE_NAME);

  if (manager.bin === "npm") {
    return execPackageManagerView(primaryBin, viewArgs);
  }

  if (manager.bin === "pnpm") {
    try {
      return execPackageManagerView(primaryBin, viewArgs);
    } catch {
      return execPackageManagerView(npmBin, ["view", PACKAGE_NAME, "version", "--json"]);
    }
  }

  return execPackageManagerView(npmBin, ["view", PACKAGE_NAME, "version", "--json"]);
}

function formatExecError(error: unknown, packageManagerBin: string): string {
  const execError = error as NodeJS.ErrnoException & {
    status?: number | null;
    stderr?: Buffer | string;
  };
  const stderr = Buffer.isBuffer(execError?.stderr)
    ? execError.stderr.toString("utf8")
    : String(execError?.stderr || "").trim();
  const message = stderr || (error instanceof Error ? error.message : String(error));

  if (execError?.code === "ENOENT") {
    return `${packageManagerBin} was not found in PATH. Install ${packageManagerBin} and retry \`yapi self-update\`.`;
  }
  if (/EACCES|permission denied|operation not permitted/i.test(message)) {
    return `Global ${packageManagerBin} install requires elevated permissions. Re-run with the required permissions or use a writable ${packageManagerBin} global prefix.`;
  }
  if (/network|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return `Network error while updating ${PACKAGE_NAME}: ${message}`;
  }
  return message;
}

export function runSelfUpdate(): number {
  const packageManager = detectPackageManager();
  const packageManagerBin = resolveLocalBin(packageManager.bin);
  const currentVersion = readVersion();

  try {
    const latestVersion = readLatestPublishedVersion(packageManager);
    if (
      latestVersion &&
      currentVersion !== "unknown" &&
      !isNewerVersion(latestVersion, currentVersion)
    ) {
      console.log(`yapi CLI is already up to date (${currentVersion}).`);
      return 0;
    }
  } catch (error) {
    const message = formatExecError(error, "npm");
    console.warn(`Could not determine latest version. Proceeding with install. ${message}`);
  }

  try {
    execFileSync(packageManagerBin, packageManager.installArgs(`${PACKAGE_NAME}@latest`), {
      stdio: "inherit",
    });
    console.log("Updated yapi CLI to latest.");
    return 0;
  } catch (error) {
    console.error(formatExecError(error, packageManager.bin));
    return 2;
  }
}
