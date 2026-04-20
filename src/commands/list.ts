import { join } from "node:path";
import { listSkills, installRoot, type Scope } from "../core/discovery.js";

export interface ListOptions {
  scope?: Scope;
  source?: "catalog" | "installed";
  catalogDir?: string;
  cwd?: string;
}

export async function listCommand(opts: ListOptions = {}): Promise<number> {
  const source = opts.source ?? "catalog";
  const root =
    source === "catalog"
      ? (opts.catalogDir ?? join(opts.cwd ?? process.cwd(), "skills"))
      : installRoot(opts.scope ?? "project", opts.cwd);

  const { skills, errors } = await listSkills(root);

  if (skills.length === 0 && errors.length === 0) {
    console.log(`No skills found in ${root}`);
    return 0;
  }

  if (skills.length > 0) {
    console.log(`Skills in ${root}:\n`);
    for (const s of skills) {
      console.log(`  ${s.manifest.name}`);
      console.log(`    ${s.manifest.description}`);
    }
  }
  if (errors.length > 0) {
    console.error(`\n${errors.length} invalid skill folder(s):`);
    for (const { path, error } of errors) {
      console.error(`  ${path}: ${error.message}`);
    }
    return 1;
  }
  return 0;
}
