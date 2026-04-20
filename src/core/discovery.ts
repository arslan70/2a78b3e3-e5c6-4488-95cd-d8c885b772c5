import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadSkill, type Skill } from "./skill.js";

export type Scope = "user" | "project";

/**
 * Codex discovery paths, per https://developers.openai.com/codex/skills/
 *   user scope:    $CODEX_HOME/skills        (default ~/.codex/skills)
 *   project scope: <cwd>/.agents/skills
 */
export function userSkillsDir(): string {
  const codexHome = process.env["CODEX_HOME"] ?? join(homedir(), ".codex");
  return join(codexHome, "skills");
}

export function projectSkillsDir(cwd: string = process.cwd()): string {
  return join(resolve(cwd), ".agents", "skills");
}

export function installRoot(scope: Scope, cwd?: string): string {
  return scope === "user" ? userSkillsDir() : projectSkillsDir(cwd);
}

/**
 * List skills in a directory. Each immediate subfolder with a SKILL.md is a skill.
 * Malformed skills are reported as errors rather than silently skipped.
 */
export async function listSkills(
  rootDir: string,
): Promise<{ skills: Skill[]; errors: Array<{ path: string; error: Error }> }> {
  if (!existsSync(rootDir)) return { skills: [], errors: [] };

  const entries = await readdir(rootDir, { withFileTypes: true });
  const skills: Skill[] = [];
  const errors: Array<{ path: string; error: Error }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = join(rootDir, entry.name);
    try {
      skills.push(await loadSkill(dir));
    } catch (err) {
      errors.push({ path: dir, error: err as Error });
    }
  }
  skills.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  return { skills, errors };
}
