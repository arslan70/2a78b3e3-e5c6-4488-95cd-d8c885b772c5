import { join } from "node:path";
import { listSkills, installRoot, type Scope } from "../core/discovery.js";
import { loadCodeowners, ownersFor } from "../core/codeowners.js";

export interface ListOptions {
  scope?: Scope;
  source?: "catalog" | "installed";
  catalogDir?: string;
  cwd?: string;
}

export async function listCommand(opts: ListOptions = {}): Promise<number> {
  const source = opts.source ?? "catalog";
  const cwd = opts.cwd ?? process.cwd();
  const root =
    source === "catalog"
      ? (opts.catalogDir ?? join(cwd, "skills"))
      : installRoot(opts.scope ?? "project", opts.cwd);

  const { skills, errors } = await listSkills(root);

  // Ownership only makes sense for the catalog view — installed skill folders
  // are detached copies and the CODEOWNERS file is not carried across.
  const rules = source === "catalog" ? await loadCodeowners(cwd) : [];

  if (skills.length === 0 && errors.length === 0) {
    console.log(`No skills found in ${root}`);
    return 0;
  }

  if (skills.length > 0) {
    console.log(`Skills in ${root}:\n`);
    for (const s of skills) {
      console.log(`  ${s.manifest.name}`);
      console.log(`    ${s.manifest.description}`);
      if (source === "catalog") {
        const owners = ownersFor(rules, `/skills/${s.manifest.name}/`);
        const label = owners.length > 0 ? owners.join(" ") : "(unowned — falls back to defaults)";
        console.log(`    owners: ${label}`);
      }
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
