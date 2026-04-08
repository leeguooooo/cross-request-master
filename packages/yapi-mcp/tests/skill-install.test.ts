import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";
import { runInstallSkill } from "../src/skill/install";
import { findOutdatedSkillInstalls, readSkillMetadata, SKILL_METADATA_FILE } from "../src/skill/metadata";

const PACKAGE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPO_SKILL_PATH = path.resolve(PACKAGE_ROOT, "..", "..", "skills", "yapi", "SKILL.md");
const TEMPLATE_SKILL_PATH = path.join(PACKAGE_ROOT, "skill-template", "SKILL.md");

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

describe("skill install metadata", () => {
  test("repository skill matches published template", () => {
    const repoSkill = fs.readFileSync(REPO_SKILL_PATH, "utf8");
    const templateSkill = fs.readFileSync(TEMPLATE_SKILL_PATH, "utf8");
    assert.equal(repoSkill, templateSkill);
  });

  test("runInstallSkill writes metadata alongside installed skill", async () => {
    const root = makeTempDir("yapi-skill-install-");
    const yapiHome = path.join(root, ".yapi");
    const codexHome = path.join(root, ".codex");
    const claudeHome = path.join(root, ".claude");
    const cursorHome = path.join(root, ".cursor");

    await runInstallSkill([
      "--yapi-base-url",
      "https://yapi.example.com",
      "--yapi-auth-mode",
      "global",
      "--yapi-email",
      "demo@example.com",
      "--yapi-password",
      "secret",
      "--yapi-home",
      yapiHome,
      "--codex-home",
      codexHome,
      "--claude-home",
      claudeHome,
      "--cursor-home",
      cursorHome,
      "--force",
    ]);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { version: string };

    for (const skillRoot of [
      path.join(codexHome, "skills", "yapi"),
      path.join(claudeHome, "skills", "yapi"),
      path.join(cursorHome, "skills", "yapi"),
    ]) {
      const metadataPath = path.join(skillRoot, SKILL_METADATA_FILE);
      assert.equal(fs.existsSync(path.join(skillRoot, "SKILL.md")), true);
      assert.equal(fs.existsSync(metadataPath), true);
      const metadata = readSkillMetadata(skillRoot);
      assert.ok(metadata);
      assert.equal(metadata?.packageVersion, pkg.version);
      assert.equal(metadata?.skillName, "yapi");
    }
  });

  test("findOutdatedSkillInstalls reports skills with older or missing metadata", () => {
    const root = makeTempDir("yapi-skill-outdated-");
    const codexHome = path.join(root, ".codex");
    const claudeHome = path.join(root, ".claude");
    const cursorHome = path.join(root, ".cursor");
    const skillRoot = path.join(codexHome, "skills", "yapi");
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), "# yapi\n", "utf8");
    fs.writeFileSync(
      path.join(skillRoot, SKILL_METADATA_FILE),
      JSON.stringify(
        {
          skillName: "yapi",
          packageName: "@leeguoo/yapi-mcp",
          packageVersion: "0.3.20",
          installedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );

    const outdated = findOutdatedSkillInstalls("0.3.24", { codexHome, claudeHome, cursorHome });
    assert.equal(outdated.length, 1);
    assert.equal(outdated[0].label, "Codex");
    assert.equal(outdated[0].installedVersion, "0.3.20");
  });
});
