import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadSkill } from "../core/skill.js";
import { listSkills } from "../core/discovery.js";

export interface ValidateOptions {
  skillName?: string;
  catalogDir?: string;
  cwd?: string;
}

/**
 * Validate skill folders against the Codex SKILL.md spec. Returns a non-zero
 * exit code if any validation errors are found.
 */
export async function validateCommand(opts: ValidateOptions = {}): Promise<number> {
  const catalogDir = resolve(opts.catalogDir ?? join(opts.cwd ?? process.cwd(), "skills"));

  if (opts.skillName) {
    const dir = join(catalogDir, opts.skillName);
    if (!existsSync(dir)) {
      console.error(`Skill not found: ${dir}`);
      return 1;
    }
    try {
      const skill = await loadSkill(dir);
      console.log(`OK  ${skill.manifest.name}`);
      return 0;
    } catch (err) {
      console.error(`FAIL ${dir}: ${(err as Error).message}`);
      return 1;
    }
  }

  if (!existsSync(catalogDir)) {
    console.error(`Catalog directory does not exist: ${catalogDir}`);
    return 1;
  }

  const { skills, errors } = await listSkills(catalogDir);
  for (const s of skills) console.log(`OK   ${s.manifest.name}`);
  for (const { path, error } of errors) console.error(`FAIL ${path}: ${error.message}`);

  const total = skills.length + errors.length;
  console.log(`\n${skills.length}/${total} skill(s) valid`);
  return errors.length === 0 ? 0 : 1;
}
