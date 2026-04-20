import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "./skill.js";

export interface PreflightReport {
  errors: string[];
  warnings: string[];
  scripts: Array<{ name: string; executable: boolean; hasShebang: boolean }>;
  envHints: Array<{ name: string; set: boolean }>;
}

const ENV_HINT_RE = /`([A-Z][A-Z0-9_]{3,})`/g;
const FILENAME = /[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/.source;
const SCRIPT_REF_RE = new RegExp(`scripts/(${FILENAME})`, "g");
const REFERENCE_REF_RE = new RegExp(`references/(${FILENAME})`, "g");

/**
 * Static checks that catch skills that will install but fail in Codex:
 * missing scripts referenced from SKILL.md, scripts without a shebang,
 * scripts without the execute bit, environment variables the skill needs
 * that are unset in the caller's shell.
 *
 * Codex can't surface these failures until the skill is already loaded
 * and the user has triggered it, so we surface them up-front instead.
 */
export async function preflightSkill(
  skill: Skill,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PreflightReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const skillMd = await readFile(join(skill.path, "SKILL.md"), "utf8");

  const scriptsDir = join(skill.path, "scripts");
  const scripts: PreflightReport["scripts"] = [];
  if (existsSync(scriptsDir)) {
    const entries = await readdir(scriptsDir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile()) continue;
      const abs = join(scriptsDir, entry.name);
      const head = await readFile(abs, { encoding: "utf8" }).then((b) => b.slice(0, 512));
      const hasShebang = head.startsWith("#!");
      const s = await stat(abs);
      const executable = (s.mode & 0o111) !== 0;
      scripts.push({ name: entry.name, executable, hasShebang });
      if (!hasShebang) {
        errors.push(`scripts/${entry.name} has no shebang (first line must start with "#!")`);
      }
      if (!executable) {
        errors.push(`scripts/${entry.name} is not executable (run: chmod +x scripts/${entry.name})`);
      }
    }
  }

  const scriptNames = new Set(scripts.map((s) => s.name));
  for (const match of skillMd.matchAll(SCRIPT_REF_RE)) {
    const name = match[1]!;
    if (!scriptNames.has(name)) {
      errors.push(`SKILL.md references scripts/${name}, but no such file exists`);
    }
  }

  const refsDir = join(skill.path, "references");
  const referenceFiles = existsSync(refsDir)
    ? new Set((await readdir(refsDir)).map((f) => f))
    : new Set<string>();
  for (const match of skillMd.matchAll(REFERENCE_REF_RE)) {
    const name = match[1]!;
    if (!referenceFiles.has(name)) {
      warnings.push(`SKILL.md references references/${name}, but no such file exists`);
    }
  }

  const envNames = new Set<string>();
  for (const match of skillMd.matchAll(ENV_HINT_RE)) {
    const token = match[1]!;
    if (token.includes("_")) envNames.add(token);
  }
  const envHints: PreflightReport["envHints"] = [...envNames].sort().map((name) => ({
    name,
    set: Boolean(env[name]),
  }));
  for (const hint of envHints) {
    if (!hint.set) {
      warnings.push(`Environment variable ${hint.name} is referenced in SKILL.md but not set`);
    }
  }

  return { errors, warnings, scripts, envHints };
}
