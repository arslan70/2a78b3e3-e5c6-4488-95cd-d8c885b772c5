import { basename, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { loadSkill, type Skill } from "../core/skill.js";
import { isValidSkillName } from "../core/validation.js";

export interface ValidateOptions {
  skillName?: string;
  catalogDir?: string;
  cwd?: string;
}

/**
 * Validate a single skill folder against the Codex SKILL.md spec, plus
 * the catalog's folder-name-equals-manifest-name invariant that install
 * relies on. Anything CI should block on belongs here, not in install.
 */
async function validateOne(dir: string): Promise<Skill> {
  const skill = await loadSkill(dir);
  const folder = basename(dir);
  if (skill.manifest.name !== folder) {
    throw new Error(
      `Folder name "${folder}" does not match SKILL.md name "${skill.manifest.name}"`,
    );
  }
  if (!isValidSkillName(skill.manifest.name)) {
    throw new Error(
      `SKILL.md name "${skill.manifest.name}" is not a valid skill name (kebab-case, no slashes or dots)`,
    );
  }
  return skill;
}

export async function validateCommand(opts: ValidateOptions = {}): Promise<number> {
  const catalogDir = resolve(opts.catalogDir ?? join(opts.cwd ?? process.cwd(), "skills"));

  if (opts.skillName) {
    const dir = join(catalogDir, opts.skillName);
    if (!existsSync(dir)) {
      console.error(`Skill not found: ${dir}`);
      return 1;
    }
    try {
      const skill = await validateOne(dir);
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

  const entries = await readdir(catalogDir, { withFileTypes: true });
  const skillNames: string[] = [];
  const errors: Array<{ path: string; error: Error }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = join(catalogDir, entry.name);
    try {
      const skill = await validateOne(dir);
      skillNames.push(skill.manifest.name);
      console.log(`OK   ${skill.manifest.name}`);
    } catch (err) {
      errors.push({ path: dir, error: err as Error });
      console.error(`FAIL ${dir}: ${(err as Error).message}`);
    }
  }

  const total = skillNames.length + errors.length;
  console.log(`\n${skillNames.length}/${total} skill(s) valid`);
  return errors.length === 0 ? 0 : 1;
}
