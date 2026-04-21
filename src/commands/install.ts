import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { loadSkill } from "../core/skill.js";
import { installRoot, type Scope } from "../core/discovery.js";
import { copyDir, isDir, removeDir } from "../core/fs.js";
import { preflightSkill } from "../core/preflight.js";
import { assertValidSkillName } from "../core/validation.js";

export interface InstallOptions {
  skillName: string;
  scope: Scope;
  from?: string;
  force?: boolean;
  strict?: boolean;
  skipPreflight?: boolean;
  cwd?: string;
}

/**
 * Install a skill by copying its folder into the Codex discovery path.
 * Codex picks up any folder in the discovery path that contains a SKILL.md
 * after a restart. See: https://developers.openai.com/codex/skills/
 */
export async function installCommand(opts: InstallOptions): Promise<number> {
  assertValidSkillName(opts.skillName);
  const cwd = opts.cwd ?? process.cwd();
  const catalogDir = opts.from ?? join(cwd, "skills");
  const source = resolve(catalogDir, opts.skillName);

  if (!(await isDir(source))) {
    console.error(`Skill "${opts.skillName}" not found at ${source}`);
    return 1;
  }

  const skill = await loadSkill(source);
  if (skill.manifest.name !== opts.skillName) {
    console.error(
      `Folder name "${opts.skillName}" does not match SKILL.md name "${skill.manifest.name}"`,
    );
    return 1;
  }

  const dest = join(installRoot(opts.scope, cwd), opts.skillName);
  if (existsSync(dest) && !opts.force) {
    console.error(
      `Destination already exists: ${dest}\nRe-run with --force to overwrite.`,
    );
    return 1;
  }

  if (!opts.skipPreflight) {
    const report = await preflightSkill(skill);
    for (const w of report.warnings) console.warn(`WARN  ${w}`);
    for (const e of report.errors) console.error(`ERROR ${e}`);
    if (report.errors.length > 0) {
      console.error(
        `\nPreflight found ${report.errors.length} error(s). Fix them, or re-run with --skip-preflight.`,
      );
      return 1;
    }
    if (opts.strict && report.warnings.length > 0) {
      console.error(`\n--strict: refusing to install with ${report.warnings.length} warning(s).`);
      return 1;
    }
  }

  await mkdir(installRoot(opts.scope, cwd), { recursive: true });
  if (opts.force && existsSync(dest)) {
    await removeDir(dest);
  }
  await copyDir(source, dest);

  console.log(`Installed "${opts.skillName}" (${opts.scope} scope)`);
  console.log(`  source: ${source}`);
  console.log(`  dest:   ${dest}`);
  console.log("\nRestart Codex to pick up the new skill.");
  return 0;
}
