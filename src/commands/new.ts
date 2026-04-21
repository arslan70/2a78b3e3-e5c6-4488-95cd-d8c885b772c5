import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { assertValidSkillName } from "../core/validation.js";

export interface NewOptions {
  skillName: string;
  owners: string[];
  description?: string;
  cwd?: string;
}

/**
 * GitHub CODEOWNERS owner syntax: `@username`, `@org/team-name`, or an email.
 * We require the `@` form here because the catalog's existing rules use teams —
 * accepting bare emails or arbitrary strings would silently break future lookups.
 */
const OWNER_RE = /^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/;

function assertValidOwner(owner: string): void {
  if (!OWNER_RE.test(owner)) {
    throw new Error(
      `Invalid owner "${owner}". Expected GitHub handle or team, e.g. @user or @org/team.`,
    );
  }
}

const STUB_DESCRIPTION =
  "TODO: describe when Codex should invoke this skill — include trigger conditions and what the skill does.";

function stubSkillMd(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

TODO: write the skill body. Explain the workflow Codex should follow when this skill triggers.
`;
}

/**
 * Append a `/skills/<name>/ <owner>...` line to `.github/CODEOWNERS`, creating
 * the file if it does not exist. Idempotent: if a rule for this path already
 * exists we leave the file untouched rather than silently duplicating it —
 * duplicate rules are legal in GitHub's syntax but make last-match-wins harder
 * to reason about.
 */
async function appendCodeownersRule(
  repoRoot: string,
  skillName: string,
  owners: string[],
): Promise<"created" | "appended" | "exists"> {
  const dir = join(repoRoot, ".github");
  const path = join(dir, "CODEOWNERS");
  const rulePath = `/skills/${skillName}/`;
  const line = `${rulePath.padEnd(36, " ")}${owners.join(" ")}`;

  if (!existsSync(path)) {
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${line}\n`, "utf8");
    return "created";
  }

  const existing = await readFile(path, "utf8");
  const alreadyClaimed = existing
    .split(/\r?\n/)
    .some((raw) => {
      const stripped = raw.replace(/\s+#.*$/, "").trim();
      if (!stripped || stripped.startsWith("#") || stripped.startsWith("[")) return false;
      const [pattern] = stripped.split(/\s+/);
      return pattern === rulePath;
    });
  if (alreadyClaimed) return "exists";

  const separator = existing.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${existing}${separator}${line}\n`, "utf8");
  return "appended";
}

export async function newCommand(opts: NewOptions): Promise<number> {
  assertValidSkillName(opts.skillName);
  if (opts.owners.length === 0) {
    throw new Error("At least one --owner is required (e.g. --owner @org/team).");
  }
  for (const o of opts.owners) assertValidOwner(o);

  const cwd = opts.cwd ?? process.cwd();
  const skillDir = join(cwd, "skills", opts.skillName);
  if (existsSync(skillDir)) {
    console.error(`Skill already exists at ${skillDir}`);
    return 1;
  }

  await mkdir(skillDir, { recursive: true });
  const description = opts.description ?? STUB_DESCRIPTION;
  await writeFile(join(skillDir, "SKILL.md"), stubSkillMd(opts.skillName, description), "utf8");

  const codeownersResult = await appendCodeownersRule(cwd, opts.skillName, opts.owners);

  console.log(`Created skill "${opts.skillName}"`);
  console.log(`  folder:     ${skillDir}`);
  console.log(`  SKILL.md:   stub written (edit the description before opening a PR)`);
  const ownerLabel = opts.owners.join(" ");
  if (codeownersResult === "created") {
    console.log(`  CODEOWNERS: created .github/CODEOWNERS with /skills/${opts.skillName}/ ${ownerLabel}`);
  } else if (codeownersResult === "appended") {
    console.log(`  CODEOWNERS: appended /skills/${opts.skillName}/ ${ownerLabel}`);
  } else {
    console.log(`  CODEOWNERS: rule for /skills/${opts.skillName}/ already present — left untouched`);
  }
  return 0;
}
