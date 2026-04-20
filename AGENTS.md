# AGENTS.md

Repository-level context for any coding agent working in this repo.

## What this repo is

A **local catalog of Codex skills** with a TypeScript CLI (`skills`) that installs them into Codex's discovery paths. Skills are plain folders under `skills/<name>/` containing a `SKILL.md`, following the [official Codex skills spec](https://developers.openai.com/codex/skills/).

## Ground rules

- **Codex-only.** Do not add Claude Code / Anthropic plugin concepts (`plugin.json`, `marketplace.json`, `.claude-plugin/`, agents/hooks/commands folders). If a feature is Claude-specific, it doesn't belong here.
- **SKILL.md frontmatter reads `name` and `description` and nothing else.** Codex ignores the rest and the validator rejects it. Do not introduce `version`, `tags`, `author`, etc. under any circumstances.
- **Folder name must match `SKILL.md` `name`.** The installer enforces this.
- **No runtime dependencies in the CLI.** The project uses Node built-ins only (`node:fs`, `node:path`, `node:os`, `node:util.parseArgs`). Dev dependencies are fine (`typescript`, `tsx`, `@types/node`).
- **Node 20+ target.** `parseArgs` and modern `fs/promises` APIs rely on it.
- **No company names, no internal URLs.** The repository is intentionally organisation-neutral.

## Repository map

```
src/
├── cli.ts              # entrypoint, arg parsing, dispatch
├── commands/           # one file per CLI subcommand
└── core/               # skill parsing, discovery paths, fs helpers
test/                   # node:test suites, run with `npm test`
skills/                 # the catalog itself — one folder per skill
.github/workflows/      # CI (lint + test + validate)
```

## Common tasks

- **Add a CLI subcommand:** new file in `src/commands/`, register in `src/cli.ts`, re-export from `src/index.ts`, add tests under `test/`.
- **Change SKILL.md validation:** update `parseSkillMd` in `src/core/skill.ts` — the spec boundary lives there and only there.
- **Change Codex install paths:** update `src/core/discovery.ts` after consulting the current [Codex docs](https://developers.openai.com/codex/skills/); they are the source of truth.
- **Add a new skill under `skills/<name>/`:** also add a matching line to `.github/CODEOWNERS` mapping the folder to the owning team. Skills without an owner fall back to Platform Engineering — that's a signal of an orphan, not a valid end state. See `CONTRIBUTING.md` → Team ownership.

## Before committing

```bash
npm run lint    # typecheck
npm test        # unit tests
npm run validate # run the catalog validator against shipped skills
```

All three must pass; CI runs the same commands.
