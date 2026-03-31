import fs from "fs";
import os from "os";
import path from "path";

export const SKILL_NAME = "yapi";
export const SKILL_METADATA_FILE = ".yapi-skill.json";
export const PACKAGE_NAME = "@leeguoo/yapi-mcp";

export type SkillTarget = {
  label: string;
  root: string;
};

export type SkillInstallMetadata = {
  skillName: string;
  packageName: string;
  packageVersion: string;
  installedAt: string;
};

export type SkillHomeOverrides = {
  codexHome?: string;
  claudeHome?: string;
  cursorHome?: string;
};

export type OutdatedSkillInstall = {
  label: string;
  root: string;
  installedVersion: string;
};

export function readPackageVersion(packageRoot: string): string {
  try {
    const pkgPath = path.join(packageRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export function resolveSkillTargets(overrides: SkillHomeOverrides = {}): SkillTarget[] {
  const codexHome =
    overrides.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const claudeHome =
    overrides.claudeHome || process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
  const cursorHome =
    overrides.cursorHome || process.env.CURSOR_HOME || path.join(os.homedir(), ".cursor");

  const targets: SkillTarget[] = [
    { label: "Codex", root: path.join(codexHome, "skills", SKILL_NAME) },
    { label: "Claude", root: path.join(claudeHome, "skills", SKILL_NAME) },
    { label: "Cursor", root: path.join(cursorHome, "skills", SKILL_NAME) },
  ];

  const seenRoots = new Set<string>();
  return targets.filter((target) => {
    if (seenRoots.has(target.root)) return false;
    seenRoots.add(target.root);
    return true;
  });
}

export function buildSkillMetadata(packageVersion: string): SkillInstallMetadata {
  return {
    skillName: SKILL_NAME,
    packageName: PACKAGE_NAME,
    packageVersion: packageVersion || "unknown",
    installedAt: new Date().toISOString(),
  };
}

export function writeSkillMetadata(targetRoot: string, packageVersion: string): string {
  const metadataPath = path.join(targetRoot, SKILL_METADATA_FILE);
  const payload = buildSkillMetadata(packageVersion);
  fs.writeFileSync(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return metadataPath;
}

export function readSkillMetadata(targetRoot: string): SkillInstallMetadata | null {
  try {
    const metadataPath = path.join(targetRoot, SKILL_METADATA_FILE);
    if (!fs.existsSync(metadataPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<SkillInstallMetadata>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      skillName: typeof parsed.skillName === "string" ? parsed.skillName : SKILL_NAME,
      packageName: typeof parsed.packageName === "string" ? parsed.packageName : PACKAGE_NAME,
      packageVersion: typeof parsed.packageVersion === "string" ? parsed.packageVersion : "unknown",
      installedAt: typeof parsed.installedAt === "string" ? parsed.installedAt : "",
    };
  } catch {
    return null;
  }
}

export function findOutdatedSkillInstalls(
  packageVersion: string,
  overrides: SkillHomeOverrides = {},
): OutdatedSkillInstall[] {
  return resolveSkillTargets(overrides)
    .map((target) => {
      if (!fs.existsSync(target.root)) return null;
      const metadata = readSkillMetadata(target.root);
      const skillPath = path.join(target.root, "SKILL.md");
      if (!metadata) {
        return fs.existsSync(skillPath)
          ? { label: target.label, root: target.root, installedVersion: "unknown" }
          : null;
      }
      if (metadata.packageVersion === packageVersion) return null;
      return {
        label: target.label,
        root: target.root,
        installedVersion: metadata.packageVersion || "unknown",
      };
    })
    .filter(Boolean) as OutdatedSkillInstall[];
}
