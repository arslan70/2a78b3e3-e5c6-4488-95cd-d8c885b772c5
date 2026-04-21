import { test } from "node:test";
import assert from "node:assert/strict";
import { load as yamlLoad } from "js-yaml";
import { parseSkillMd } from "../src/core/skill.ts";

/**
 * Differential test: for every SKILL.md frontmatter shape that falls inside
 * our supported subset (single-line scalars, quoted scalars, `|` literal,
 * `>` folded), our hand-rolled parser must agree with js-yaml on the two
 * fields Codex actually reads. js-yaml is a devDependency only — runtime
 * stays zero-deps — so this is purely a correctness cross-check.
 *
 * Cases where the two parsers legitimately diverge (js-yaml accepts YAML
 * features our spec allowlist rejects, such as `tags: [a, b]`) live in the
 * "intentional divergence" tests below — we assert our parser throws and
 * do not compare to js-yaml there.
 */

interface FrontmatterOnly {
  name: string;
  description: string;
}

function withFrontmatter(body: string): string {
  return `---\n${body}\n---\n\nMarkdown body.\n`;
}

function yamlManifest(frontmatter: string): FrontmatterOnly {
  const doc = yamlLoad(frontmatter) as Record<string, unknown>;
  return { name: String(doc["name"]), description: String(doc["description"]) };
}

const PARITY_CASES: Array<{ label: string; frontmatter: string }> = [
  {
    label: "plain single-line scalars",
    frontmatter: `name: example\ndescription: does a thing`,
  },
  {
    label: "double-quoted scalars",
    frontmatter: `name: "quoted-name"\ndescription: "quoted description"`,
  },
  {
    label: "single-quoted scalars",
    frontmatter: `name: 'quoted-name'\ndescription: 'quoted description'`,
  },
  {
    label: "literal block scalar for description",
    frontmatter: `name: litty\ndescription: |\n  line one\n  line two`,
  },
  {
    label: "folded block scalar for description",
    frontmatter: `name: foldy\ndescription: >\n  first line continues\n  onto a second line\n  and a third`,
  },
  {
    label: "comments and blank lines between fields",
    frontmatter: `# a leading comment\nname: with-comments\n\n# and another\ndescription: has comments around it`,
  },
  {
    label: "description containing special characters",
    frontmatter: `name: punctuated\ndescription: "contains: colons, commas, and a question mark?"`,
  },
];

for (const { label, frontmatter } of PARITY_CASES) {
  test(`yaml parity — ${label}`, () => {
    const ours = parseSkillMd(withFrontmatter(frontmatter));
    const theirs = yamlManifest(frontmatter);
    assert.equal(ours.name, theirs.name, `name mismatch for: ${label}`);
    assert.equal(
      ours.description,
      theirs.description,
      `description mismatch for: ${label}\n  ours:   ${JSON.stringify(ours.description)}\n  theirs: ${JSON.stringify(theirs.description)}`,
    );
  });
}

/**
 * Intentional divergence: js-yaml accepts these shapes but the Codex spec
 * allows only `name` and `description`, so our parser must reject them.
 * These tests pin the policy — if they ever start passing through, the
 * allowlist has regressed.
 */
const POLICY_REJECTIONS: Array<{ label: string; frontmatter: string; expected: RegExp }> = [
  {
    label: "flow-style list value",
    frontmatter: `name: x\ndescription: y\ntags: [a, b]`,
    expected: /Unsupported frontmatter field "tags"/,
  },
  {
    label: "version field",
    frontmatter: `name: x\ndescription: y\nversion: 1.0.0`,
    expected: /Unsupported frontmatter field "version"/,
  },
  {
    // js-yaml parses this as { meta: { author: "alice" } }; our parser
    // rejects it because the allowlist forbids extra top-level keys. The
    // exact error message is not the invariant — only the rejection is.
    label: "nested map value",
    frontmatter: `name: x\ndescription: y\nmeta:\n  author: alice`,
    expected: /./,
  },
];

for (const { label, frontmatter, expected } of POLICY_REJECTIONS) {
  test(`policy rejection — ${label}`, () => {
    // Sanity-check that js-yaml would have accepted the shape, so we know
    // our rejection comes from the allowlist, not a shared parser failure.
    assert.doesNotThrow(() => yamlLoad(frontmatter));
    assert.throws(() => parseSkillMd(withFrontmatter(frontmatter)), expected);
  });
}
