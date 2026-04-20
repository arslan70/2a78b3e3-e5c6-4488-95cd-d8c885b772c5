import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installCommand } from "../src/commands/install.ts";
import { listSkills, userSkillsDir } from "../src/core/discovery.ts";
import { loadSkill } from "../src/core/skill.ts";
import { preflightSkill } from "../src/core/preflight.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = ["context7-docs", "dependency-bump-reviewer"] as const;

/**
 * End-to-end: every shipped skill installs into a sandboxed CODEX_HOME,
 * parses cleanly from the discovery path, and is what Codex will actually
 * load at runtime. This is the contract we claim in the README.
 */
test("each shipped skill installs into CODEX_HOME and is discoverable", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "codex-home-"));
  const prev = process.env["CODEX_HOME"];
  process.env["CODEX_HOME"] = codexHome;
  try {
    for (const name of SHIPPED) {
      const code = await installCommand({
        skillName: name,
        scope: "user",
        cwd: REPO_ROOT,
      });
      assert.equal(code, 0, `install failed for ${name}`);
    }

    const discoveryPath = userSkillsDir();
    assert.equal(discoveryPath, join(codexHome, "skills"));

    const { skills, errors } = await listSkills(discoveryPath);
    assert.deepEqual(errors, [], "discovery should surface no errors");
    const names = skills.map((s) => s.manifest.name).sort();
    assert.deepEqual(names, [...SHIPPED].sort());

    for (const skill of skills) {
      assert.ok(skill.manifest.description.length > 40, `${skill.manifest.name} description is too terse for Codex routing`);
    }
  } finally {
    if (prev === undefined) delete process.env["CODEX_HOME"];
    else process.env["CODEX_HOME"] = prev;
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("install rejects a skill with a broken script (preflight gate)", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  try {
    const skillDir = join(cwd, "skills", "broken");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: broken
description: exercises scripts/run.sh
---

Run scripts/run.sh to do the thing.
`,
    );
    await writeFile(join(skillDir, "scripts", "run.sh"), "echo no shebang here\n");
    const code = await installCommand({
      skillName: "broken",
      scope: "project",
      cwd,
    });
    assert.equal(code, 1, "install should fail when a script has no shebang");
    assert.ok(
      !existsSync(join(cwd, ".agents", "skills", "broken")),
      "broken skill must not be copied",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("install rejects a SKILL.md that references a missing script", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  try {
    const skillDir = join(cwd, "skills", "phantom");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: phantom
description: references a script that does not exist
---

Run scripts/does-not-exist.sh and report the result.
`,
    );
    const code = await installCommand({
      skillName: "phantom",
      scope: "project",
      cwd,
    });
    assert.equal(code, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("--skip-preflight lets a broken skill install (explicit escape hatch)", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  try {
    const skillDir = join(cwd, "skills", "broken");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: broken
description: has a script with no shebang
---

Run scripts/run.sh.
`,
    );
    await writeFile(join(skillDir, "scripts", "run.sh"), "echo no shebang\n");
    const code = await installCommand({
      skillName: "broken",
      scope: "project",
      cwd,
      skipPreflight: true,
    });
    assert.equal(code, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("preflight on context7-docs: scripts executable, env hints detected", async () => {
  const skill = await loadSkill(join(REPO_ROOT, "skills", "context7-docs"));
  const report = await preflightSkill(skill, { CONTEXT7_API_KEY: "test-key" });
  assert.equal(report.errors.length, 0, `unexpected errors: ${report.errors.join(", ")}`);
  const fetchScript = report.scripts.find((s) => s.name === "fetch.sh");
  assert.ok(fetchScript, "fetch.sh should be listed");
  assert.ok(fetchScript!.hasShebang, "fetch.sh should have a shebang");
  assert.ok(fetchScript!.executable, "fetch.sh should be executable");
  const apiKey = report.envHints.find((h) => h.name === "CONTEXT7_API_KEY");
  assert.ok(apiKey, "CONTEXT7_API_KEY should be detected as a required env var");
  assert.equal(apiKey!.set, true);
});

test("strict mode refuses install when env hints are unset", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  try {
    const skillDir = join(cwd, "skills", "needs-env");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: needs-env
description: requires API_TOKEN_XYZ to be set at runtime
---

Set \`API_TOKEN_XYZ\` and run scripts/run.sh.
`,
    );
    const scriptPath = join(skillDir, "scripts", "run.sh");
    await writeFile(scriptPath, "#!/usr/bin/env bash\necho hi\n");
    await chmod(scriptPath, 0o755);
    delete process.env["API_TOKEN_XYZ"];
    const code = await installCommand({
      skillName: "needs-env",
      scope: "project",
      cwd,
      strict: true,
    });
    assert.equal(code, 1);
    const relaxed = await installCommand({
      skillName: "needs-env",
      scope: "project",
      cwd,
    });
    assert.equal(relaxed, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
