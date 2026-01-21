import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import yargs from "yargs";

const SKILL_NAME = "yapi";
const PLACEHOLDER_EMAIL = "YOUR_EMAIL";
const PLACEHOLDER_PASSWORD = "YOUR_PASSWORD";

const SKILL_TEMPLATE_DIR = "skill-template";
const SKILL_TEMPLATE_FILE = "SKILL.md";

function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent || "";
  if (userAgent.includes("pnpm")) return "pnpm";
  if (userAgent.includes("yarn")) return "yarn";
  if (userAgent.includes("npm")) return "npm";
  const execPath = process.env.npm_execpath || "";
  if (execPath.includes("pnpm")) return "pnpm";
  if (execPath.includes("yarn")) return "yarn";
  if (execPath.includes("npm")) return "npm";
  return "unknown";
}

function resolvePackageRoot(startDir: string): string {
  let current = path.resolve(startDir);
  const { root } = path.parse(current);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      let pkgName: string | undefined;
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { name?: string };
        pkgName = pkg.name;
      } catch {
        pkgName = undefined;
      }
      if (pkgName === "@leeguoo/yapi-mcp") return current;
    }
    if (current === root) break;
    current = path.dirname(current);
  }
  return path.resolve(__dirname, "..", "..");
}

type InstallArgs = {
  "yapi-base-url"?: string;
  "yapi-token"?: string;
  "yapi-auth-mode"?: "token" | "global";
  "yapi-email"?: string;
  "yapi-password"?: string;
  "project-id"?: string;
  "yapi-home"?: string;
  "codex-home"?: string;
  "claude-home"?: string;
  force?: boolean;
};

function parseSimpleToml(text: string): Record<string, string> {
  const data: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].split(";", 1)[0].trim();
    if (!line || line.startsWith("[")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

function escapeTomlValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatToml(config: Record<string, string>): string {
  const orderedKeys = ["base_url", "auth_mode", "email", "password", "token", "project_id"];
  const lines = ["# YApi skill config"];

  for (const key of orderedKeys) {
    const value = config[key] ?? "";
    lines.push(`${key} = "${escapeTomlValue(value)}"`);
  }

  const extras = Object.keys(config)
    .filter((key) => !orderedKeys.includes(key))
    .sort();
  for (const key of extras) {
    const value = config[key] ?? "";
    lines.push(`${key} = "${escapeTomlValue(value)}"`);
  }

  return `${lines.join("\n")}\n`;
}

function ensurePrivate(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // ignore chmod errors on non-posix filesystems
  }
}

async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const originalWrite = (rl as any)._writeToOutput;
  (rl as any)._writeToOutput = function writeToOutput(stringToWrite: string) {
    if ((rl as any).stdoutMuted) return;
    if (typeof originalWrite === "function") {
      originalWrite.call(this, stringToWrite);
    } else {
      (rl as any).output.write(stringToWrite);
    }
  };
  (rl as any).stdoutMuted = true;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      (rl as any).stdoutMuted = false;
      rl.close();
      resolve(answer);
    });
  });
}

async function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function promptRequired(question: string, hidden: boolean): Promise<string> {
  while (true) {
    const answer = hidden ? await promptHidden(question) : await promptText(question);
    const trimmed = String(answer || "").trim();
    if (trimmed) return trimmed;
  }
}

function resolveAuthMode(config: Record<string, string>, args: InstallArgs): "token" | "global" {
  const explicit = args["yapi-auth-mode"];
  if (explicit === "token" || explicit === "global") return explicit;

  if (args["yapi-token"] || config.token) return "token";
  if (args["yapi-email"] || args["yapi-password"] || config.email || config.password)
    return "global";

  return "global";
}

export async function runInstallSkill(rawArgs: string[]): Promise<void> {
  const argv = yargs(rawArgs)
    .options({
      "yapi-base-url": { type: "string", describe: "YApi base URL" },
      "yapi-token": { type: "string", describe: "YApi project token" },
      "yapi-auth-mode": { type: "string", choices: ["token", "global"], describe: "Auth mode" },
      "yapi-email": { type: "string", describe: "Login email for global auth" },
      "yapi-password": { type: "string", describe: "Login password for global auth" },
      "project-id": { type: "string", describe: "Select project token by id" },
      "yapi-home": { type: "string", describe: "Override YApi config home (default: ~/.yapi)" },
      "codex-home": { type: "string", describe: "Override CODEX_HOME" },
      "claude-home": { type: "string", describe: "Override Claude home (default: ~/.claude)" },
      force: {
        type: "boolean",
        default: false,
        describe: "Overwrite skill files if they already exist",
      },
    })
    .help()
    .parseSync() as InstallArgs;

  const yapiHome = argv["yapi-home"] || process.env.YAPI_HOME || path.join(os.homedir(), ".yapi");
  const codexHome =
    argv["codex-home"] || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const claudeHome =
    argv["claude-home"] || process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
  const globalConfigPath = path.join(yapiHome, "config.toml");
  const targets = [
    { label: "Codex", root: path.join(codexHome, "skills", SKILL_NAME) },
    { label: "Claude", root: path.join(claudeHome, "skills", SKILL_NAME) },
  ];
  const seenRoots = new Set<string>();
  const uniqueTargets = targets.filter((target) => {
    if (seenRoots.has(target.root)) return false;
    seenRoots.add(target.root);
    return true;
  });

  let existingConfig: Record<string, string> = {};
  if (fs.existsSync(globalConfigPath)) {
    existingConfig = parseSimpleToml(fs.readFileSync(globalConfigPath, "utf8"));
  } else {
    for (const target of uniqueTargets) {
      const configPath = path.join(target.root, "config.toml");
      if (fs.existsSync(configPath)) {
        existingConfig = parseSimpleToml(fs.readFileSync(configPath, "utf8"));
        break;
      }
    }
  }

  const merged = { ...existingConfig };
  if (argv["yapi-base-url"] || process.env.YAPI_BASE_URL) {
    merged.base_url = argv["yapi-base-url"] || process.env.YAPI_BASE_URL || "";
  }
  if (argv["yapi-token"] || process.env.YAPI_TOKEN) {
    merged.token = argv["yapi-token"] || process.env.YAPI_TOKEN || "";
  }
  if (argv["project-id"] || process.env.YAPI_PROJECT_ID) {
    merged.project_id = argv["project-id"] || process.env.YAPI_PROJECT_ID || "";
  }

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

  if (!merged.base_url && isInteractive) {
    merged.base_url = await promptRequired("YApi base URL: ", false);
  }
  if (!merged.base_url) {
    throw new Error("Missing --yapi-base-url or YAPI_BASE_URL; cannot write config.");
  }

  const authMode = resolveAuthMode(merged, argv);
  merged.auth_mode = authMode;

  if (argv["yapi-email"] || process.env.YAPI_EMAIL) {
    merged.email = argv["yapi-email"] || process.env.YAPI_EMAIL || "";
  }

  let password = argv["yapi-password"] || process.env.YAPI_PASSWORD || merged.password || "";
  if (authMode === "global") {
    if (!merged.email && isInteractive) {
      merged.email = await promptRequired("YApi email: ", false);
    }
    if (!merged.email) {
      merged.email = PLACEHOLDER_EMAIL;
    }
    if (!password && isInteractive) {
      password = await promptRequired("YApi password: ", true);
    }
    if (!password) {
      password = merged.password || PLACEHOLDER_PASSWORD;
      console.warn("Warning: password not provided; writing placeholder to config.");
    }
  }
  merged.password = password;

  const packageRoot = resolvePackageRoot(__dirname);
  const templatePath = path.join(packageRoot, SKILL_TEMPLATE_DIR, SKILL_TEMPLATE_FILE);
  if (!fs.existsSync(templatePath)) {
    const manager = detectPackageManager();
    throw new Error(
      `Missing skill template: ${templatePath} (package root: ${packageRoot}, manager: ${manager})`,
    );
  }
  const skillTemplate = fs.readFileSync(templatePath, "utf8");

  const installedRoots: string[] = [];
  const configPaths: string[] = [];

  fs.mkdirSync(yapiHome, { recursive: true });
  fs.writeFileSync(globalConfigPath, formatToml(merged), "utf8");
  ensurePrivate(globalConfigPath);
  configPaths.push(globalConfigPath);

  for (const target of uniqueTargets) {
    if (fs.existsSync(target.root)) {
      fs.rmSync(target.root, { recursive: true, force: true });
    }
    fs.mkdirSync(target.root, { recursive: true });

    const configPath = path.join(target.root, "config.toml");
    const skillPath = path.join(target.root, "SKILL.md");

    fs.writeFileSync(skillPath, skillTemplate, "utf8");

    fs.writeFileSync(configPath, formatToml(merged), "utf8");
    ensurePrivate(configPath);

    installedRoots.push(`${target.label}: ${target.root}`);
    configPaths.push(configPath);
  }

  console.log(`Installed skill '${SKILL_NAME}' at:`);
  installedRoots.forEach((entry) => console.log(`- ${entry}`));
  console.log("Config written to:");
  configPaths.forEach((entry) => console.log(`- ${entry}`));
  console.log("Restart Codex/Claude Code to pick up new skills.");
}
