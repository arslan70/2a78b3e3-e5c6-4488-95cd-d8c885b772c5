import { join } from "node:path";
import { existsSync } from "node:fs";
import { installRoot, type Scope } from "../core/discovery.js";
import { removeDir } from "../core/fs.js";
import { assertValidSkillName } from "../core/validation.js";

export interface UninstallOptions {
  skillName: string;
  scope: Scope;
  cwd?: string;
}

export async function uninstallCommand(opts: UninstallOptions): Promise<number> {
  assertValidSkillName(opts.skillName);
  const dest = join(installRoot(opts.scope, opts.cwd), opts.skillName);
  if (!existsSync(dest)) {
    console.error(`Skill not installed at ${dest}`);
    return 1;
  }
  await removeDir(dest);
  console.log(`Removed "${opts.skillName}" from ${dest}`);
  return 0;
}
