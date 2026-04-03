import { runInstallSkill } from "../../skill/install";

export async function runInstallSkillCommand(rawArgs: string[]): Promise<number> {
  await runInstallSkill(rawArgs);
  return 0;
}
