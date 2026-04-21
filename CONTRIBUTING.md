# Contributing

Thanks for your interest in contributing a skill. This catalog is open to any team or individual. The contract is small on purpose: a skill is a folder with a `SKILL.md`, and the CLI takes care of the rest.

## Table of contents

- [Before you start](#before-you-start)
- [What a skill is](#what-a-skill-is)
- [SKILL.md](#skillmd)
- [Folder layout](#folder-layout)
- [Scripts](#scripts)
- [Authoring workflow](#authoring-workflow)
- [Validation](#validation)
- [Ownership model](#ownership-model)
- [Versioning](#versioning)
- [Review process](#review-process)
- [Deprecation and removal](#deprecation-and-removal)

## Before you start

- Skim the [Codex skills spec](https://developers.openai.com/codex/skills/). This catalog follows it exactly; we don't invent new fields.
- Search `skills/` to check whether a similar skill already exists. Extend it rather than duplicating.
- A skill you add becomes a small piece of infrastructure others depend on. If you can't commit to maintaining it, propose it as an issue first.

## What a skill is

A skill is a folder of instructions (and optional helpers) that Codex loads when its `description` matches the task at hand. Codex discovers skills by walking its discovery paths and treating any subfolder containing a `SKILL.md` as a skill.

Good skills are:

- **Narrow.** One skill, one job. A `description` that lists four unrelated triggers is a sign it should be split.
- **Self-contained.** Anything the skill needs at runtime is in its folder.
- **Deterministic where possible.** Scripts beat prose when an action is well-defined (e.g. running a linter).
- **Safe by default.** Skills run inside Codex's sandbox; prefer read-only operations and flag anything that mutates state, installs software, or reaches the network.

## SKILL.md

Required. YAML frontmatter followed by a Markdown body.

```markdown
---
name: my-skill
description: Explains exactly when this skill should and should not trigger.
---

Markdown instructions Codex will follow.
```

### Frontmatter rules

- **Only `name` and `description`.** Codex ignores everything else, and the CLI's `validate` command rejects it to prevent silent drift.
- `name` must be kebab-case and must match the folder name.
- `description` should tell Codex **when to use this skill and when not to**. That is the whole routing signal — vague descriptions cause mis-routing.

### Body rules

- Write for Codex, not for humans reading the repo. Direct second-person imperatives work well ("Read the file X, then run Y").
- Reference scripts and assets by relative path.
- Keep it short. Long preambles eat context; link to `references/` for anything optional.

### Frontmatter parser limits

Our parser is deliberately small (no runtime deps, ~70 lines) because Codex
reads only `name` and `description`. Stay inside this subset of YAML and you
will not hit surprises:

**Supported**

- Plain scalar values on a single line: `name: my-skill`.
- Single- or double-quoted values: `description: "hello"` or `'hello'`.
  The outermost matching pair is stripped; inner quotes are preserved
  verbatim (no escape handling).
- Literal block scalars (`|`): newlines preserved as-is. One trailing
  newline is always present (YAML default clip chomping).
  ```yaml
  description: |
    first line
    second line
  ```
- Folded block scalars (`>`): single newlines are folded to spaces; blank
  lines collapse to a single newline; one trailing newline is always
  present. Good for long prose descriptions.
- Blank lines and `#` comment lines inside the frontmatter.

**Not supported — will either throw or silently round-trip wrong**

- Nested keys, flow-style maps/lists (`tags: [a, b]`, `meta: {x: 1}`).
  The validator rejects unknown keys outright, so nested structures fail
  loudly.
- Chomping indicators (`|-`, `|+`, `>-`, `>+`) — use plain `|` or `>`.
- Anchors (`&foo`) and aliases (`*foo`), merge keys (`<<`), explicit
  tags (`!!str`), multi-document streams (`---` more than once).
- Escape sequences inside double-quoted scalars (`\n`, `\t`). A
  double-quoted scalar is treated as a literal string between the
  matching quotes.
- Keys containing characters outside `[A-Za-z_][A-Za-z0-9_-]*`.
- Indented continuation of a plain scalar across lines — use `|` or `>`
  if you need a multi-line value.

If you find yourself wanting a feature in this list, push back on the
requirement before adding it to the parser — the point of the small
surface is that every skill in the catalog is readable with the same
30-second mental model.

## Folder layout

```
skills/<name>/
├── SKILL.md          # required
├── scripts/          # optional — executable helpers
├── references/       # optional — supplementary docs, examples
└── assets/           # optional — templates, fixtures, static files
```

No other top-level conventions are required. `skills validate` only enforces that `SKILL.md` exists and parses correctly.

## Scripts

- Use any language available in the Codex environment. Python and Bash are the most portable.
- Make scripts executable (`chmod +x`) and add a shebang.
- Scripts should exit non-zero on failure and print a helpful message to stderr.
- Don't assume network access — if a script needs it, say so explicitly in `SKILL.md`.

## Authoring workflow

1. Fork or branch the repository.
2. Create `skills/<your-skill>/SKILL.md` and any supporting files.
3. Validate:
   ```bash
   npm run validate
   # or
   npx skills validate <your-skill>
   ```
4. Install it locally against your own Codex and try it on a realistic task:
   ```bash
   npm run build
   npm link
   skills install <your-skill>
   # restart Codex, then invoke the skill
   ```
5. Add a `CODEOWNERS` entry for your skill (see [Ownership model](#ownership-model)).
6. Open a PR. Include: what the skill does, when it triggers, what you tested, and which team owns it.

## Validation

The CLI enforces:

- A `SKILL.md` exists in every skill folder.
- Frontmatter has `name` and `description` and nothing else.
- The folder name matches the frontmatter `name`.

CI runs `npm run lint`, `npm test`, and `npm run validate` on every PR — both the CLI and the catalog must pass.

## Ownership model

This catalog is multi-tenant: many teams contribute skills into the same repository, but no single group reviews every PR. The model is deliberately **mixed**. Platform Engineering owns the CLI, the spec, and CI, so the contract every skill depends on stays coherent. Each skill is owned by the team that wrote it, so contributions never wait on a central reviewer. Ownership is declared in [`.github/CODEOWNERS`](./.github/CODEOWNERS) and enforced by GitHub.

### Why a mixed model

- **No bottleneck.** A PR that only touches `/skills/foo/` is auto-routed to the team that owns `foo`. Platform Engineering does not need to approve it.
- **Clear responsibility.** If a skill misfires in production, `git blame` + `CODEOWNERS` tell you exactly who to page.
- **Safe shared surface.** The CLI (`src/`), CI (`.github/workflows/`), and the authoring guides are owned by Platform Engineering so the contract that every team depends on cannot drift under them.
- **The alternatives both fail.** *Fully central ownership* turns the catalog into a review bottleneck and discourages contribution. *Fully distributed ownership* drifts on spec conformance, safety, and CLI compatibility — every skill slowly becomes a bespoke snowflake. Splitting ownership by *contract vs. content* gives you the throughput of distributed ownership without losing the coherence of a central contract.

### How to claim a skill

When you open a PR that adds `/skills/<your-skill>/`, add one line to `.github/CODEOWNERS` in the same PR:

```text
/skills/<your-skill>/      @<org>/<your-team>
```

The `skills new` command does both in one step — scaffolds the folder with a stub `SKILL.md` and appends the CODEOWNERS line for you:

```bash
skills new <your-skill> --owner @<org>/<your-team>
# multiple owners are supported: --owner @org/a --owner @org/b
```

It refuses to overwrite an existing skill folder, and if a CODEOWNERS rule for the path already exists it leaves the file untouched rather than duplicating it.

Rules to keep the file readable and correct:

- **One skill per line.** Do not group folders; it makes transfers and audits harder.
- **Team, not individual, where possible.** Individuals leave; teams persist.
- **Put specific rules below general ones.** GitHub applies the *last* matching rule, so skill lines must live under the defaults.
- **Multiple owners = all must approve.** Use this sparingly — most skills should have a single owning team.

### Transferring or handing off a skill

If your team no longer owns a skill:

1. Open a PR that updates the `CODEOWNERS` line to the new owning team.
2. Get approval from **both** the current and the incoming owners.
3. Mention the transfer in the PR body so it shows up in the release notes.

### Orphaned skills

A skill without a matching `CODEOWNERS` line falls back to the default owners (Platform Engineering). That is a signal the skill is unowned and a candidate for [deprecation](#deprecation-and-removal), not a permanent state.

## Versioning

Codex has no concept of a skill version in the `SKILL.md` spec, and we don't pretend otherwise. Treat **git tags** as the unit of release: tag the repo when a meaningful batch of changes lands, and downstream users who pin to a tag get a stable snapshot.

When making breaking changes to an existing skill (renamed commands, changed invocation pattern, removed behaviors):

- Describe the change in the PR body so the release notes capture it.
- Prefer adding a new skill and deprecating the old one over silently changing behavior under the same name.

## Review process

- Every PR needs at least one approval from the relevant code owner, as resolved by [`.github/CODEOWNERS`](./.github/CODEOWNERS).
- PRs scoped to a single `/skills/<name>/` folder only need approval from that skill's owning team.
- PRs that touch shared surface (`src/`, `test/`, `.github/`, this guide, the README) need approval from Platform Engineering.
- A PR that adds a new skill gets an extra pass on scope, safety, and clarity of `description`, plus a check that `CODEOWNERS` was updated.
- Reviewers may ask for a narrower scope, a clearer trigger, or a safer default. That's the job of review, not a judgment on the contributor.

## Deprecation and removal

- Skills that are unmaintained or that repeatedly misfire (per user feedback) may be deprecated.
- Deprecation is announced in the changelog and the `SKILL.md` description is updated to steer Codex away from it; removal follows a reasonable grace period.
