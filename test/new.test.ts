import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newCommand } from "../src/commands/new.ts";
import { loadSkill } from "../src/core/skill.ts";
import { parseCodeowners, ownersFor } from "../src/core/codeowners.ts";

async function withTmp<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "skills-new-"));
  try {
    return await fn(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function captureLogs(): { restore: () => void; lines: string[] } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

test("skills new scaffolds SKILL.md and appends CODEOWNERS when file exists", async () => {
  await withTmp(async (cwd) => {
    await mkdir(join(cwd, ".github"), { recursive: true });
    await writeFile(
      join(cwd, ".github", "CODEOWNERS"),
      `*   @org/default\n`,
    );

    const code = await newCommand({
      skillName: "release-notes",
      owners: ["@org/docs-team"],
      cwd,
    });
    assert.equal(code, 0);

    // SKILL.md parses and carries the expected name
    const skill = await loadSkill(join(cwd, "skills", "release-notes"));
    assert.equal(skill.manifest.name, "release-notes");
    assert.match(skill.manifest.description, /TODO/);

    // CODEOWNERS was appended, not replaced
    const codeowners = await readFile(join(cwd, ".github", "CODEOWNERS"), "utf8");
    assert.match(codeowners, /\*\s+@org\/default/);
    const rules = parseCodeowners(codeowners);
    assert.deepEqual(ownersFor(rules, "/skills/release-notes/"), ["@org/docs-team"]);
  });
});

test("skills new creates .github/CODEOWNERS when the file does not exist", async () => {
  await withTmp(async (cwd) => {
    const code = await newCommand({
      skillName: "fresh-skill",
      owners: ["@org/team-a", "@org/team-b"],
      cwd,
    });
    assert.equal(code, 0);

    const codeowners = await readFile(join(cwd, ".github", "CODEOWNERS"), "utf8");
    assert.match(codeowners, /\/skills\/fresh-skill\/\s+@org\/team-a @org\/team-b/);
    const rules = parseCodeowners(codeowners);
    assert.deepEqual(ownersFor(rules, "/skills/fresh-skill/"), ["@org/team-a", "@org/team-b"]);
  });
});

test("skills new refuses to overwrite an existing skill folder", async () => {
  await withTmp(async (cwd) => {
    await mkdir(join(cwd, "skills", "already-here"), { recursive: true });
    await writeFile(join(cwd, "skills", "already-here", "SKILL.md"), "existing\n");

    const cap = captureLogs();
    let code: number;
    try {
      code = await newCommand({
        skillName: "already-here",
        owners: ["@org/team"],
        cwd,
      });
    } finally {
      cap.restore();
    }
    assert.equal(code, 1);
    assert.match(cap.lines.join("\n"), /already exists/);

    // Existing file was not touched
    const contents = await readFile(join(cwd, "skills", "already-here", "SKILL.md"), "utf8");
    assert.equal(contents, "existing\n");
  });
});

test("skills new is idempotent for the CODEOWNERS rule", async () => {
  await withTmp(async (cwd) => {
    await mkdir(join(cwd, ".github"), { recursive: true });
    await writeFile(
      join(cwd, ".github", "CODEOWNERS"),
      `/skills/already-claimed/   @org/existing\n`,
    );
    // First create the skill folder manually, then re-run new on a *different*
    // name but pre-seed CODEOWNERS with a stale rule for it to prove the
    // "skip if present" branch.
    const code = await newCommand({
      skillName: "already-claimed",
      owners: ["@org/new-team"],
      cwd,
    });
    assert.equal(code, 0);

    const codeowners = await readFile(join(cwd, ".github", "CODEOWNERS"), "utf8");
    // Should still show the original owner — no append, no rewrite
    const matches = codeowners.match(/\/skills\/already-claimed\//g) ?? [];
    assert.equal(matches.length, 1, "rule should appear exactly once");
    const rules = parseCodeowners(codeowners);
    assert.deepEqual(ownersFor(rules, "/skills/already-claimed/"), ["@org/existing"]);
  });
});

test("skills new rejects path-traversal skill names", async () => {
  await withTmp(async (cwd) => {
    await assert.rejects(
      newCommand({ skillName: "../escape", owners: ["@org/team"], cwd }),
      /Invalid skill name/,
    );
    await assert.rejects(
      newCommand({ skillName: "Has_Underscore", owners: ["@org/team"], cwd }),
      /Invalid skill name/,
    );
    // Nothing should have been created
    await assert.rejects(stat(join(cwd, "skills")), /ENOENT/);
  });
});

test("skills new rejects malformed owner strings", async () => {
  await withTmp(async (cwd) => {
    await assert.rejects(
      newCommand({ skillName: "ok-name", owners: ["no-at-sign"], cwd }),
      /Invalid owner/,
    );
    await assert.rejects(
      newCommand({ skillName: "ok-name", owners: ["@"], cwd }),
      /Invalid owner/,
    );
    await assert.rejects(
      newCommand({ skillName: "ok-name", owners: ["@org/team with space"], cwd }),
      /Invalid owner/,
    );
  });
});

test("skills new requires at least one owner", async () => {
  await withTmp(async (cwd) => {
    await assert.rejects(
      newCommand({ skillName: "ok-name", owners: [], cwd }),
      /--owner is required|At least one --owner/,
    );
  });
});

test("skills new accepts a custom description and it parses back", async () => {
  await withTmp(async (cwd) => {
    const description = "Trigger when the user wants to cut a release. Runs scripts/cut.sh.";
    const code = await newCommand({
      skillName: "cut-release",
      owners: ["@org/release-team"],
      description,
      cwd,
    });
    assert.equal(code, 0);
    const skill = await loadSkill(join(cwd, "skills", "cut-release"));
    assert.equal(skill.manifest.description, description);
  });
});
