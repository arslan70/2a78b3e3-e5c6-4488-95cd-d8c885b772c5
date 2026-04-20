import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillMd } from "../src/core/skill.ts";

test("parses name and description", () => {
  const input = `---
name: example
description: does a thing
---

Body content.
`;
  const manifest = parseSkillMd(input);
  assert.equal(manifest.name, "example");
  assert.equal(manifest.description, "does a thing");
});

test("rejects missing frontmatter", () => {
  assert.throws(() => parseSkillMd("just body\n"), /missing YAML frontmatter/);
});

test("rejects extra frontmatter fields (Codex only reads name/description)", () => {
  const input = `---
name: example
description: x
version: 1.0.0
---
body
`;
  assert.throws(() => parseSkillMd(input), /Unsupported frontmatter field "version"/);
});

test("rejects missing name", () => {
  const input = `---
description: x
---
body
`;
  assert.throws(() => parseSkillMd(input), /missing required field: name/);
});

test("rejects missing description", () => {
  const input = `---
name: x
---
body
`;
  assert.throws(() => parseSkillMd(input), /missing required field: description/);
});

test("strips matching quotes from values", () => {
  const input = `---
name: "quoted-name"
description: 'quoted description'
---
body
`;
  const m = parseSkillMd(input);
  assert.equal(m.name, "quoted-name");
  assert.equal(m.description, "quoted description");
});

test("parses folded block scalar description (>)", () => {
  const input = `---
name: foldy
description: >
  first line continues
  onto a second line
  and a third
---
body
`;
  const m = parseSkillMd(input);
  assert.equal(m.name, "foldy");
  assert.equal(
    m.description,
    "first line continues onto a second line and a third",
  );
});

test("parses literal block scalar description (|)", () => {
  const input = `---
name: litty
description: |
  line one
  line two
---
body
`;
  const m = parseSkillMd(input);
  assert.equal(m.description, "line one\nline two");
});
