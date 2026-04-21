import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { loadSkill, type Skill } from "../core/skill.js";
import { installRoot, type Scope } from "../core/discovery.js";
import { isDir } from "../core/fs.js";
import { assertValidSkillName } from "../core/validation.js";

export interface RunOptions {
  skillName: string;
  exec?: string;
  execArgs?: string[];
  from?: string;
  scope?: Scope;
  cwd?: string;
}

type ResolvedSkill = Skill & {
  source: "project" | "user" | "catalog" | "custom";
};

async function resolve_skill(
  skillName: string,
  from: string | undefined,
  scope: Scope | undefined,
  cwd: string,
): Promise<ResolvedSkill | null> {
  const candidates: Array<{ dir: string; source: ResolvedSkill["source"] }> = [];
  if (from) {
    candidates.push({ dir: resolve(from, skillName), source: "custom" });
  } else if (scope === "user") {
    candidates.push({ dir: join(installRoot("user"), skillName), source: "user" });
  } else if (scope === "project") {
    candidates.push(
      { dir: join(installRoot("project", cwd), skillName), source: "project" },
      { dir: join(cwd, "skills", skillName), source: "catalog" },
    );
  } else {
    candidates.push(
      { dir: join(installRoot("project", cwd), skillName), source: "project" },
      { dir: join(installRoot("user"), skillName), source: "user" },
      { dir: join(cwd, "skills", skillName), source: "catalog" },
    );
  }
  for (const c of candidates) {
    if (await isDir(c.dir)) {
      const skill = await loadSkill(c.dir);
      return { ...skill, source: c.source };
    }
  }
  return null;
}

async function walk(dir: string, base: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, e.name);
    const rel = relative(base, abs);
    if (e.isDirectory()) {
      out.push(`${rel}/`);
      out.push(...(await walk(abs, base)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

const ENV_HINT_RE = /`([A-Z][A-Z0-9_]{3,})`/g;

async function collectEnvHints(skillDir: string): Promise<string[]> {
  const body = await readFile(join(skillDir, "SKILL.md"), "utf8");
  const seen = new Set<string>();
  for (const m of body.matchAll(ENV_HINT_RE)) {
    const token = m[1]!;
    if (token.includes("_")) seen.add(token);
  }
  return [...seen].sort();
}

async function listScripts(skillDir: string): Promise<string[]> {
  const scriptsDir = join(skillDir, "scripts");
  if (!existsSync(scriptsDir)) return [];
  const entries = await readdir(scriptsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

/**
 * `skills run <name>` — by default, dry-run: print the resolved skill
 * (path, scope, manifest, file tree, env hints, available scripts) without
 * side-effects. This is what Codex itself sees after discovery.
 *
 * With `--exec <script>`, spawn `scripts/<script>` from the resolved skill
 * with any remaining args. stdout/stderr stream through; the child's exit
 * code becomes ours.
 */
export async function runCommand(opts: RunOptions): Promise<number> {
  assertValidSkillName(opts.skillName);
  const cwd = opts.cwd ?? process.cwd();
  const resolved = await resolve_skill(opts.skillName, opts.from, opts.scope, cwd);
  if (!resolved) {
    console.error(`Skill "${opts.skillName}" not found in project, user, or catalog scope.`);
    return 1;
  }

  if (opts.exec) {
    const scriptPath = join(resolved.path, "scripts", opts.exec);
    if (!existsSync(scriptPath)) {
      console.error(`Script not found: ${scriptPath}`);
      return 1;
    }
    const s = await stat(scriptPath);
    if (!s.isFile()) {
      console.error(`Not a file: ${scriptPath}`);
      return 1;
    }
    return await new Promise<number>((res) => {
      const child = spawn(scriptPath, opts.execArgs ?? [], {
        cwd,
        stdio: "inherit",
      });
      child.on("error", (err) => {
        console.error(`Failed to execute ${scriptPath}: ${err.message}`);
        res(1);
      });
      child.on("exit", (code) => res(code ?? 1));
    });
  }

  const [files, envHints, scripts] = await Promise.all([
    walk(resolved.path, resolved.path),
    collectEnvHints(resolved.path),
    listScripts(resolved.path),
  ]);

  console.log(`Skill: ${resolved.manifest.name}`);
  console.log(`Source: ${resolved.source}`);
  console.log(`Path:   ${resolved.path}`);
  console.log(`\nDescription:`);
  for (const line of resolved.manifest.description.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log(`\nFiles:`);
  for (const f of files) console.log(`  ${f}`);

  if (scripts.length > 0) {
    console.log(`\nExecutable scripts:`);
    for (const s of scripts) console.log(`  scripts/${s}`);
    console.log(
      `\nRun one with:  skills run ${resolved.manifest.name} --exec <script> [args...]`,
    );
  }

  if (envHints.length > 0) {
    console.log(`\nEnvironment variables referenced in SKILL.md:`);
    for (const key of envHints) {
      const set = process.env[key] ? "set" : "missing";
      console.log(`  ${key}: ${set}`);
    }
  }
  return 0;
}
