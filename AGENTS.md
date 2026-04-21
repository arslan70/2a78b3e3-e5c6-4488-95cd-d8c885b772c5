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
├── cli.ts                  # entrypoint, arg parsing, dispatch
├── index.ts                # library entrypoint (re-exports commands + core)
├── commands/
│   ├── list.ts             # skills list [--installed] [--global]
│   ├── install.ts          # skills install <name> [--global] [--force]
│   │                       #   [--strict] [--skip-preflight] [--from <dir>]
│   ├── uninstall.ts        # skills uninstall <name> [--global]
│   ├── validate.ts         # skills validate [name]
│   ├── doctor.ts           # skills doctor <name> — static preflight report
│   └── run.ts              # skills run <name> [--exec <script>] [-- <args...>]
└── core/
    ├── skill.ts            # parseSkillMd, loadSkill — the spec boundary
    ├── discovery.ts        # userSkillsDir, projectSkillsDir, listSkills
    ├── preflight.ts        # scripts/env/references static checks
    └── fs.ts               # copyDir, removeDir, isDir
test/                       # node:test suites, run with `npm test`
skills/                     # the catalog itself — one folder per skill
.github/workflows/          # CI (lint + test + validate)
```

## Design decisions worth preserving

- **Preflight is a separate layer from validate.** `validate` enforces the Codex spec (frontmatter, folder/name match). `preflight` catches failures Codex can only surface at runtime — missing shebangs, non-executable scripts, SKILL.md references to files that don't exist, unset environment variables. Install runs preflight by default and refuses on errors; `--skip-preflight` is the escape hatch; `--strict` also fails on warnings.
- **Three resolution orders.** `install` reads only from the catalog (`skills/<name>`). `run` and `doctor` resolve in order: project scope → user scope → catalog. `--global` narrows to user scope; `--from <dir>` overrides entirely.
- **Custom YAML parser, deliberately limited.** `parseSkillMd` is ~70 lines of hand-rolled parsing so the CLI has zero runtime dependencies. Its supported/unsupported subset is documented in `CONTRIBUTING.md` → "Frontmatter parser limits". `js-yaml` is a devDependency only: `test/yaml-parity.test.ts` feeds the same frontmatter to both parsers and asserts they agree on `{name, description}` for the supported subset, and asserts our parser rejects inputs js-yaml would accept when they fall outside the spec allowlist (e.g. extra top-level keys). If a skill needs YAML features outside that subset, push back on the requirement before expanding the parser.

## Common tasks

- **Add a CLI subcommand:** new file in `src/commands/`, register in `src/cli.ts` (update `HELP` string), re-export from `src/index.ts`, add tests under `test/`.
- **Change SKILL.md validation:** update `parseSkillMd` in `src/core/skill.ts` — the spec boundary lives there and only there. Update the allow/deny list in `CONTRIBUTING.md` in the same PR.
- **Change preflight checks:** update `preflightSkill` in `src/core/preflight.ts`. Errors block install; warnings only block under `--strict`. Cover new checks in `test/codex-integration.test.ts`.
- **Change Codex install paths:** update `src/core/discovery.ts` after consulting the current [Codex docs](https://developers.openai.com/codex/skills/); they are the source of truth.
- **Add a new skill under `skills/<name>/`:** also add a matching line to `.github/CODEOWNERS` mapping the folder to the owning team. Run `npm run build && node dist/cli.js doctor <name> --from skills` before opening the PR. See `CONTRIBUTING.md` → Team ownership.

## Before committing

```bash
npm run lint    # typecheck
npm test        # unit tests
npm run validate # run the catalog validator against shipped skills
```

All three must pass; CI runs the same commands.
