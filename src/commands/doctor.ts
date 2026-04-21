import { join, resolve } from "node:path";
import { loadSkill } from "../core/skill.js";
import { installRoot, type Scope } from "../core/discovery.js";
import { isDir } from "../core/fs.js";
import { preflightSkill } from "../core/preflight.js";
import { assertValidSkillName } from "../core/validation.js";

export interface DoctorOptions {
  skillName: string;
  scope?: Scope;
  from?: string;
  cwd?: string;
}

/**
 * `skills doctor <name>` — static preflight for a skill: scripts, env hints,
 * references. Resolution order matches `run`: project-installed → user-installed
 * → catalog. Non-zero exit on any error so CI can gate on it.
 */
export async function doctorCommand(opts: DoctorOptions): Promise<number> {
  assertValidSkillName(opts.skillName);
  const cwd = opts.cwd ?? process.cwd();
  const candidates: Array<{ dir: string; source: string }> = [];
  if (opts.from) {
    candidates.push({ dir: resolve(opts.from, opts.skillName), source: "custom" });
  } else if (opts.scope === "user") {
    candidates.push({ dir: join(installRoot("user"), opts.skillName), source: "user" });
  } else if (opts.scope === "project") {
    candidates.push(
      { dir: join(installRoot("project", cwd), opts.skillName), source: "project" },
      { dir: join(cwd, "skills", opts.skillName), source: "catalog" },
    );
  } else {
    candidates.push(
      { dir: join(installRoot("project", cwd), opts.skillName), source: "project" },
      { dir: join(installRoot("user"), opts.skillName), source: "user" },
      { dir: join(cwd, "skills", opts.skillName), source: "catalog" },
    );
  }

  let chosen: { dir: string; source: string } | null = null;
  for (const c of candidates) {
    if (await isDir(c.dir)) {
      chosen = c;
      break;
    }
  }
  if (!chosen) {
    console.error(`Skill "${opts.skillName}" not found in any scope.`);
    return 1;
  }

  const skill = await loadSkill(chosen.dir);
  const report = await preflightSkill(skill);

  console.log(`Skill:  ${skill.manifest.name}`);
  console.log(`Source: ${chosen.source}`);
  console.log(`Path:   ${skill.path}\n`);

  if (report.scripts.length > 0) {
    console.log("Scripts:");
    for (const s of report.scripts) {
      const flags = [s.executable ? "+x" : "-x", s.hasShebang ? "shebang" : "no-shebang"].join(" ");
      console.log(`  scripts/${s.name}  [${flags}]`);
    }
    console.log("");
  }

  if (report.envHints.length > 0) {
    console.log("Environment variables referenced in SKILL.md:");
    for (const h of report.envHints) {
      console.log(`  ${h.name}: ${h.set ? "set" : "missing"}`);
    }
    console.log("");
  }

  for (const w of report.warnings) console.warn(`WARN  ${w}`);
  for (const e of report.errors) console.error(`ERROR ${e}`);

  if (report.errors.length === 0 && report.warnings.length === 0) {
    console.log("OK — no issues found.");
    return 0;
  }
  return report.errors.length === 0 ? 0 : 1;
}
