import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCommand } from "../src/commands/install.ts";
import { uninstallCommand } from "../src/commands/uninstall.ts";
import { validateCommand } from "../src/commands/validate.ts";

async function makeCatalog(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skills-test-"));
  const skillDir = join(root, "skills", "greeter");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---
name: greeter
description: says hello
---

Greet the user.
`,
  );
  return root;
}

test("install copies skill to project scope and uninstall removes it", async () => {
  const cwd = await makeCatalog();
  try {
    const code = await installCommand({ skillName: "greeter", scope: "project", cwd });
    assert.equal(code, 0);

    const installedSkill = join(cwd, ".agents", "skills", "greeter", "SKILL.md");
    assert.ok(existsSync(installedSkill), "skill was copied to project path");
    const body = await readFile(installedSkill, "utf8");
    assert.match(body, /name: greeter/);

    const rmCode = await uninstallCommand({ skillName: "greeter", scope: "project", cwd });
    assert.equal(rmCode, 0);
    assert.ok(!existsSync(installedSkill), "skill was removed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("install refuses to overwrite without --force", async () => {
  const cwd = await makeCatalog();
  try {
    await installCommand({ skillName: "greeter", scope: "project", cwd });
    const second = await installCommand({ skillName: "greeter", scope: "project", cwd });
    assert.equal(second, 1, "second install without --force should fail");

    const forced = await installCommand({
      skillName: "greeter",
      scope: "project",
      cwd,
      force: true,
    });
    assert.equal(forced, 0, "second install with --force should succeed");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("install rejects folder/name mismatch", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  const skillDir = join(cwd, "skills", "folder-a");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---
name: different-name
description: x
---
body
`,
  );
  try {
    const code = await installCommand({ skillName: "folder-a", scope: "project", cwd });
    assert.equal(code, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("validate passes for a well-formed catalog", async () => {
  const cwd = await makeCatalog();
  try {
    const code = await validateCommand({ catalogDir: join(cwd, "skills") });
    assert.equal(code, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("validate fails when frontmatter has extra fields", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  const skillDir = join(cwd, "skills", "bad");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---
name: bad
description: x
tags: [a, b]
---
body
`,
  );
  try {
    const code = await validateCommand({ catalogDir: join(cwd, "skills") });
    assert.equal(code, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
