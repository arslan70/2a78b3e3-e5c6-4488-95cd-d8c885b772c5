import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCommand } from "../src/commands/install.ts";
import { uninstallCommand } from "../src/commands/uninstall.ts";
import { runCommand } from "../src/commands/run.ts";
import { doctorCommand } from "../src/commands/doctor.ts";
import { validateCommand } from "../src/commands/validate.ts";

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "skills-test-"));
}

test("install rejects a skill name containing path-traversal", async () => {
  const cwd = await scratch();
  try {
    await mkdir(join(cwd, "skills", "escape"), { recursive: true });
    await writeFile(
      join(cwd, "skills", "escape", "SKILL.md"),
      `---\nname: escape\ndescription: x\n---\nbody\n`,
    );
    await assert.rejects(
      () => installCommand({ skillName: "../escape", scope: "project", cwd }),
      /Invalid skill name/,
    );
    assert.ok(
      !existsSync(join(cwd, ".agents", "escape")),
      "nothing should have been copied outside .agents/skills/",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("uninstall rejects a skill name containing path-traversal", async () => {
  const cwd = await scratch();
  try {
    const victim = join(cwd, ".agents", "victim");
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "important.txt"), "preserve me\n");
    await assert.rejects(
      () => uninstallCommand({ skillName: "../victim", scope: "project", cwd }),
      /Invalid skill name/,
    );
    assert.ok(existsSync(victim), "sibling directory must not be deleted");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run and doctor reject path-traversal skill names", async () => {
  const cwd = await scratch();
  try {
    await assert.rejects(
      () => runCommand({ skillName: "../boom", cwd }),
      /Invalid skill name/,
    );
    await assert.rejects(
      () => doctorCommand({ skillName: "../boom", cwd }),
      /Invalid skill name/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run with default scope falls back to user-installed skill", async () => {
  const cwd = await scratch();
  const codexHome = await mkdtemp(join(tmpdir(), "codex-home-"));
  const prev = process.env["CODEX_HOME"];
  process.env["CODEX_HOME"] = codexHome;
  try {
    const installed = join(codexHome, "skills", "only-user");
    await mkdir(installed, { recursive: true });
    await writeFile(
      join(installed, "SKILL.md"),
      `---\nname: only-user\ndescription: lives only in user scope\n---\nbody\n`,
    );
    const code = await runCommand({ skillName: "only-user", cwd });
    assert.equal(code, 0, "default resolution must walk project → user → catalog");
  } finally {
    if (prev === undefined) delete process.env["CODEX_HOME"];
    else process.env["CODEX_HOME"] = prev;
    await rm(cwd, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("validate fails when folder name does not match SKILL.md name", async () => {
  const cwd = await scratch();
  try {
    const bad = join(cwd, "skills", "folder-a");
    await mkdir(bad, { recursive: true });
    await writeFile(
      join(bad, "SKILL.md"),
      `---\nname: different-name\ndescription: x\n---\nbody\n`,
    );
    const singleCode = await validateCommand({
      skillName: "folder-a",
      catalogDir: join(cwd, "skills"),
    });
    assert.equal(singleCode, 1, "single-skill validate must reject the mismatch");

    const catalogCode = await validateCommand({ catalogDir: join(cwd, "skills") });
    assert.equal(catalogCode, 1, "catalog validate must reject the mismatch");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("install --force replaces the destination instead of overlaying it", async () => {
  const cwd = await scratch();
  try {
    const skillDir = join(cwd, "skills", "greeter");
    await mkdir(join(skillDir, "references"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: greeter\ndescription: says hi\n---\nbody\n`,
    );
    await writeFile(join(skillDir, "references", "old.md"), "soon-to-be-deleted\n");
    assert.equal(
      await installCommand({ skillName: "greeter", scope: "project", cwd }),
      0,
    );

    await rm(join(skillDir, "references", "old.md"));
    assert.equal(
      await installCommand({ skillName: "greeter", scope: "project", cwd, force: true }),
      0,
    );

    const installedRefs = join(cwd, ".agents", "skills", "greeter", "references");
    const remaining = existsSync(installedRefs)
      ? (await readdir(installedRefs)).filter((f) => !f.startsWith("."))
      : [];
    assert.deepEqual(
      remaining,
      [],
      "--force must remove files that no longer exist in the source",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
