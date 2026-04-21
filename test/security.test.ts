import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chmod } from "node:fs/promises";
import { installCommand } from "../src/commands/install.ts";
import { uninstallCommand } from "../src/commands/uninstall.ts";
import { runCommand } from "../src/commands/run.ts";
import { doctorCommand } from "../src/commands/doctor.ts";
import { validateCommand } from "../src/commands/validate.ts";
import { loadSkill } from "../src/core/skill.ts";
import { preflightSkill } from "../src/core/preflight.ts";

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

test("run --exec refuses paths that escape the scripts directory", async () => {
  const cwd = await scratch();
  try {
    const skillDir = join(cwd, "skills", "demo");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: demo\ndescription: x\n---\nbody\n`,
    );
    const sentinel = join(skillDir, "outside.sh");
    await writeFile(sentinel, "#!/usr/bin/env bash\necho breached > /tmp/skills-test-breach\n");
    await chmod(sentinel, 0o755);

    const traversal = await runCommand({
      skillName: "demo",
      exec: "../outside.sh",
      cwd,
    });
    assert.equal(traversal, 1);

    const absolute = await runCommand({
      skillName: "demo",
      exec: "/etc/passwd",
      cwd,
    });
    assert.equal(absolute, 1);

    assert.ok(
      !existsSync("/tmp/skills-test-breach"),
      "traversal target must never have been executed",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("run --exec spawns child with the skill dir as cwd", async () => {
  const cwd = await scratch();
  try {
    const skillDir = join(cwd, "skills", "selfref");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await mkdir(join(skillDir, "references"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: selfref\ndescription: resolves references/msg.txt via scripts/print.sh\n---\nbody\n`,
    );
    await writeFile(join(skillDir, "references", "msg.txt"), "hello-from-skill-dir\n");
    const marker = join(cwd, "child-cwd.txt");
    const script = join(skillDir, "scripts", "print.sh");
    await writeFile(
      script,
      `#!/usr/bin/env bash\nset -euo pipefail\ncat references/msg.txt > "${marker}"\n`,
    );
    await chmod(script, 0o755);

    const code = await runCommand({
      skillName: "selfref",
      exec: "print.sh",
      cwd,
    });
    assert.equal(code, 0, "child should be able to read its own references/");
    assert.ok(existsSync(marker), "marker file not written");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preflight recognises nested scripts and references", async () => {
  const cwd = await scratch();
  try {
    const skillDir = join(cwd, "skills", "nested");
    await mkdir(join(skillDir, "scripts", "python"), { recursive: true });
    await mkdir(join(skillDir, "references", "examples"), { recursive: true });
    const script = join(skillDir, "scripts", "python", "run.sh");
    await writeFile(
      skillDir + "/SKILL.md",
      `---\nname: nested\ndescription: uses scripts/python/run.sh and references/examples/case-a.md\n---\n\nCall scripts/python/run.sh with references/examples/case-a.md as context.\n`,
    );
    await writeFile(script, "#!/usr/bin/env bash\necho hi\n");
    await chmod(script, 0o755);
    await writeFile(join(skillDir, "references", "examples", "case-a.md"), "case A\n");

    const skill = await loadSkill(skillDir);
    const report = await preflightSkill(skill);
    assert.deepEqual(report.errors, [], `unexpected errors: ${report.errors.join(", ")}`);
    assert.deepEqual(report.warnings, []);
    assert.ok(
      report.scripts.find((s) => s.name === "python/run.sh"),
      "nested script should be surfaced with its relative path",
    );
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
