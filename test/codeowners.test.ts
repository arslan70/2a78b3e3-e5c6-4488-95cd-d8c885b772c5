import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCodeowners, ownersFor } from "../src/core/codeowners.ts";
import { listCommand } from "../src/commands/list.ts";

test("parseCodeowners ignores blanks, comments, and section headers", () => {
  const text = `# a header comment

*             @org/default

[Section]
/src/         @org/core

/skills/foo/  @org/foo-team  # inline comment
`;
  const rules = parseCodeowners(text);
  assert.deepEqual(
    rules.map((r) => ({ pattern: r.pattern, owners: r.owners })),
    [
      { pattern: "*", owners: ["@org/default"] },
      { pattern: "/src/", owners: ["@org/core"] },
      { pattern: "/skills/foo/", owners: ["@org/foo-team"] },
    ],
  );
});

test("ownersFor applies last-matching-rule-wins", () => {
  const rules = parseCodeowners(`*          @org/default
/skills/a/ @org/team-a
/skills/b/ @org/team-b
/skills/b/ @org/team-b @org/team-c
`);
  assert.deepEqual(ownersFor(rules, "/skills/a/"), ["@org/team-a"]);
  assert.deepEqual(ownersFor(rules, "/skills/b/"), ["@org/team-b", "@org/team-c"]);
  assert.deepEqual(
    ownersFor(rules, "/skills/unclaimed/"),
    ["@org/default"],
    "unclaimed path falls back to the default rule",
  );
});

test("ownersFor: /src/ does not accidentally match a skill path", () => {
  const rules = parseCodeowners(`*      @org/default
/src/  @org/platform
`);
  assert.deepEqual(ownersFor(rules, "/skills/foo/"), ["@org/default"]);
});

test("skills list shows owners for each catalog skill", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  try {
    const skillA = join(cwd, "skills", "alpha");
    const skillB = join(cwd, "skills", "beta");
    await mkdir(skillA, { recursive: true });
    await mkdir(skillB, { recursive: true });
    await writeFile(
      join(skillA, "SKILL.md"),
      `---\nname: alpha\ndescription: first skill\n---\nbody\n`,
    );
    await writeFile(
      join(skillB, "SKILL.md"),
      `---\nname: beta\ndescription: second skill\n---\nbody\n`,
    );
    await mkdir(join(cwd, ".github"), { recursive: true });
    await writeFile(
      join(cwd, ".github", "CODEOWNERS"),
      `*              @org/default\n/skills/alpha/ @org/team-alpha\n`,
    );

    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    try {
      const code = await listCommand({ source: "catalog", cwd });
      assert.equal(code, 0);
    } finally {
      console.log = origLog;
    }
    const output = captured.join("\n");
    assert.match(output, /alpha\n.*first skill\n.*owners: @org\/team-alpha/);
    assert.match(
      output,
      /beta\n.*second skill\n.*owners: @org\/default/,
      "beta should fall back to the default owner",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("skills list --installed does not print owners (CODEOWNERS is catalog-scoped)", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-test-"));
  try {
    const installed = join(cwd, ".agents", "skills", "alpha");
    await mkdir(installed, { recursive: true });
    await writeFile(
      join(installed, "SKILL.md"),
      `---\nname: alpha\ndescription: first skill\n---\nbody\n`,
    );
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    try {
      const code = await listCommand({ source: "installed", scope: "project", cwd });
      assert.equal(code, 0);
    } finally {
      console.log = origLog;
    }
    const output = captured.join("\n");
    assert.match(output, /alpha/);
    assert.ok(!/owners:/.test(output), "installed listing should omit owners");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
