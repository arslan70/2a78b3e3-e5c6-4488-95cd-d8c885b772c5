# Skills Marketplace

A local catalog of [OpenAI Codex](https://developers.openai.com/codex/skills/) skills with a TypeScript CLI to discover, install, and validate them.

Skills live in `skills/<name>/` as plain folders containing a `SKILL.md`. The CLI copies them into Codex's discovery paths so any Codex installation on your machine picks them up natively.

The two shipped skills prove the design in a single repo. [`dependency-bump-reviewer`](./skills/dependency-bump-reviewer/SKILL.md) (owned by Security) calls [`context7-docs`](./skills/context7-docs/SKILL.md) (owned by Platform Engineering) to review dependency bumps — one skill reaching across team boundaries instead of every team reinventing retrieval. Platform Engineering also owns the CLI and the `SKILL.md` contract that every skill depends on. [`CODEOWNERS`](./.github/CODEOWNERS) routes each PR to the right owner, so a change to one skill never blocks teams who don't own it. That is the whole argument for a catalog: [**shared contract, distributed content**](#ownership-model), with [**composition**](#included-skills) across owners instead of duplication inside each team.

## Requirements

- Node.js 20 or newer
- An installation of OpenAI Codex for the skills to be used by

## Install the CLI

From this repository:

```bash
npm install
npm run build
npm link         # makes the `skills` command available globally
```

## Commands

```
skills list                       # list skills in the catalog
skills list --installed           # list skills currently installed (project scope)
skills list --installed --global  # list installed user-scope skills
skills install <name>             # install to project scope (./.agents/skills/<name>)
skills install <name> --global    # install to user scope ($CODEX_HOME/skills/<name>)
skills install <name> --force     # overwrite an existing install
skills install <name> --strict    # fail on preflight warnings, not just errors
skills install <name> --skip-preflight
                                  # bypass the preflight gate (not recommended)
skills uninstall <name>           # remove from project scope
skills uninstall <name> --global  # remove from user scope
skills validate                   # validate every SKILL.md in the catalog
skills validate <name>            # validate a single skill
skills doctor <name>              # static preflight: scripts, env hints, references
skills run <name>                 # dry-run: show what Codex sees after discovery
skills run <name> --exec <script> [-- <args...>]
                                  # spawn scripts/<script> from the resolved skill
```

Restart Codex after installing or uninstalling a skill.

## Install scopes

| Scope     | Path                                                 | When to use                               |
| --------- | ---------------------------------------------------- | ----------------------------------------- |
| `project` | `./.agents/skills/<name>` (default)                  | Skill is only relevant in this repository |
| `--global` | `$CODEX_HOME/skills/<name>` (default `~/.codex/skills/<name>`) | Skill should be available everywhere      |

Paths follow the [Codex skills discovery spec](https://developers.openai.com/codex/skills/).

## What a skill looks like

```
skills/<name>/
├── SKILL.md          # required; YAML frontmatter + Markdown instructions
├── scripts/          # optional; executable helpers the skill may run
├── references/       # optional; extra docs the skill may read on demand
└── assets/           # optional; templates or static files
```

`SKILL.md` frontmatter reads only two fields, by Codex's own rule:

```markdown
---
name: example
description: Explains exactly when this skill should and should not trigger.
---

Instructions for Codex follow here.
```

Any other frontmatter field causes `skills validate` to fail.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full authoring guide.

## Included skills

Two skills ship with the catalog, chosen to exercise the abstractions end to end:

- **[`context7-docs`](./skills/context7-docs/SKILL.md)** — *knowledge retrieval.* Fetches up-to-date library documentation from [Context7](https://context7.com) for a library named in the repo's dependency manifest, pinned to the installed version. Prefers Context7's remote MCP server (`https://mcp.context7.com/mcp`) and falls back to the HTTP API via `scripts/fetch.sh`. Requires `CONTEXT7_API_KEY` in the environment.
- **[`dependency-bump-reviewer`](./skills/dependency-bump-reviewer/SKILL.md)** — *structured PR review.* Produces a breaking-change review for Renovate/Dependabot PRs, grounded in the real changelog. Performs a transitive peer-dependency check (the place most single-package bumps actually break) and emits a literal output template. Each field answers a different question a reviewer actually asks, in skim order:

  | Field               | Question it answers                                              |
  | ------------------- | ---------------------------------------------------------------- |
  | `Verdict`           | Can I just approve this? (`safe` / `review` / `blocking`)        |
  | `Source`            | How much should I trust this review? (`release-notes` > `web-search`)       |
  | `Baseline`          | Was the repo green *before* the bump? Separates cause from noise.           |
  | `Transitive peers`  | Will every plugin still accept the new version? Where single bumps usually break. |
  | `Breaking`          | What changed incompatibly, and does my repo use any of it? (`file:line` or `no static hits`) |
  | `Noteworthy`        | What non-breaking changes should I still know about? (new config, Node bumps, deprecations) |
  | `Test checklist`    | If I merge, what should I actually exercise?                    |
  | `Routes to`         | Who owns the call? The skill drafts; a `CODEOWNERS` human decides. |

  The rigid template is the point — each field forces a discipline that prose would let the model skip (admitting the source, running a baseline, checking peers, pairing changelog items with grep hits).

> **Composition.** The two skills do different jobs that plug together. `dependency-bump-reviewer` reads release notes to see *what* changed between versions, then calls `context7-docs` for version-pinned docs on *how the new API looks* — so the review is grounded in the real new-version surface rather than a guess. Two narrow skills, one review pipeline — which is the argument for a marketplace in the first place.

See each `SKILL.md` for the exact trigger rules and output contract.

## Ownership model

**Shared contract, distributed content.** One team owns the CLI and the `SKILL.md` spec, so the contract every skill depends on stays coherent. Each skill is owned by the team that wrote it, so contributions never wait on a central reviewer. Neither half works alone: central-only ownership becomes a bottleneck, distributed-only ownership drifts on quality and spec conformance. The mix is the point.

Ownership is declared in [`.github/CODEOWNERS`](./.github/CODEOWNERS), which GitHub uses to auto-request review from the right team on every PR:

- **Skill folders** (`/skills/<name>/`) are owned by the team that authored them.
- **Shared code** (`src/`, `test/`, CI, README, CONTRIBUTING, AGENTS.md) is owned by Platform Engineering so the contract that every team depends on cannot drift under them.
- When you add a skill, add a matching line to `CODEOWNERS` in the same PR. When you hand a skill off, update the line.

### Worked example

Three realistic PRs show how the routing plays out:

| Change                                                   | Files touched                              | `CODEOWNERS` resolves to                        | Result                                          |
| -------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Security tightens the bump-reviewer output template      | `/skills/dependency-bump-reviewer/`        | `@<org>/<security-team>`                        | Merges when Security approves                   |
| A new optional frontmatter field is added to the spec    | `src/core/skill.ts`, `test/`               | `@<org>/<platform-engineering>`                 | Platform Engineering gates — it's a contract change |
| A new skill is added alongside a validator tweak         | `/skills/new-skill/`, `src/core/`          | both teams                                      | Both must approve before merge                  |

Security never waits on Platform Engineering for a change scoped to their own skill. Platform Engineering never reviews a skill edit they did not write. When a PR genuinely crosses the boundary — new content *and* a contract change — GitHub enforces that both teams are on it.

See [CONTRIBUTING.md → Ownership model](./CONTRIBUTING.md#ownership-model) for the authoring workflow.

## Development

```bash
npm install
npm test          # run unit tests
npm run lint      # typecheck
npm run validate  # validate the shipped catalog
```

## License

MIT — see [LICENSE](./LICENSE).
