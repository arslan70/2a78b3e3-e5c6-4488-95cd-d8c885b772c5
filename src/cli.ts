#!/usr/bin/env node
import { parseArgs } from "node:util";
import { listCommand } from "./commands/list.js";
import { installCommand } from "./commands/install.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { validateCommand } from "./commands/validate.js";
import { runCommand } from "./commands/run.js";
import { doctorCommand } from "./commands/doctor.js";
import { newCommand } from "./commands/new.js";
import type { Scope } from "./core/discovery.js";

const HELP = `skills — a CLI for a Codex skills catalog

Usage:
  skills list      [--installed] [--global]    List catalog skills (default) or installed skills
  skills new       <name> --owner <@org/team> [--owner <@org/team2>...] [--description <text>]
                                               Scaffold skills/<name>/SKILL.md and claim it in .github/CODEOWNERS
  skills install   <name> [--global] [--force] [--from <dir>]
                                               Install a catalog skill into a Codex discovery path
  skills uninstall <name> [--global]           Remove an installed skill
  skills validate  [name]                      Validate SKILL.md files in the catalog
  skills doctor    <name> [--global] [--from <dir>]
                                               Preflight an installed or catalog skill (scripts, env, references)
  skills run       <name> [--exec <script>] [--global] [--from <dir>] [-- <args...>]
                                               Dry-run a skill (show what Codex sees), or spawn scripts/<script>

Scope flags:
  --global        Target user scope ($CODEX_HOME/skills, default ~/.codex/skills).
                  Without this flag, commands default to project scope (./.agents/skills).

See CONTRIBUTING.md for the skill layout. Restart Codex after install/uninstall.
`;

function parseScope(values: Record<string, unknown>): Scope {
  return values["global"] ? "user" : "project";
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(HELP);
    return 0;
  }

  try {
    switch (command) {
      case "list": {
        const { values } = parseArgs({
          args: rest,
          options: {
            installed: { type: "boolean", default: false },
            global: { type: "boolean", default: false },
          },
          allowPositionals: false,
          strict: true,
        });
        return listCommand({
          scope: parseScope(values),
          source: values.installed ? "installed" : "catalog",
        });
      }

      case "install": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            global: { type: "boolean", default: false },
            force: { type: "boolean", default: false },
            from: { type: "string" },
            strict: { type: "boolean", default: false },
            "skip-preflight": { type: "boolean", default: false },
          },
          allowPositionals: true,
          strict: true,
        });
        const name = positionals[0];
        if (!name) {
          console.error("install: missing skill name\n\n" + HELP);
          return 2;
        }
        return installCommand({
          skillName: name,
          scope: parseScope(values),
          force: values.force,
          strict: values.strict,
          skipPreflight: values["skip-preflight"],
          ...(values.from ? { from: values.from } : {}),
        });
      }

      case "uninstall": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: { global: { type: "boolean", default: false } },
          allowPositionals: true,
          strict: true,
        });
        const name = positionals[0];
        if (!name) {
          console.error("uninstall: missing skill name\n\n" + HELP);
          return 2;
        }
        return uninstallCommand({ skillName: name, scope: parseScope(values) });
      }

      case "run": {
        const sep = rest.indexOf("--");
        const flagArgs = sep === -1 ? rest : rest.slice(0, sep);
        const execArgs = sep === -1 ? [] : rest.slice(sep + 1);
        const { values, positionals } = parseArgs({
          args: flagArgs,
          options: {
            global: { type: "boolean", default: false },
            from: { type: "string" },
            exec: { type: "string" },
          },
          allowPositionals: true,
          strict: true,
        });
        const name = positionals[0];
        if (!name) {
          console.error("run: missing skill name\n\n" + HELP);
          return 2;
        }
        return runCommand({
          skillName: name,
          ...(values.global ? { scope: "user" as const } : {}),
          ...(values.exec ? { exec: values.exec } : {}),
          ...(execArgs.length ? { execArgs } : {}),
          ...(values.from ? { from: values.from } : {}),
        });
      }

      case "doctor": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            global: { type: "boolean", default: false },
            from: { type: "string" },
          },
          allowPositionals: true,
          strict: true,
        });
        const name = positionals[0];
        if (!name) {
          console.error("doctor: missing skill name\n\n" + HELP);
          return 2;
        }
        return doctorCommand({
          skillName: name,
          ...(values.global ? { scope: "user" as const } : {}),
          ...(values.from ? { from: values.from } : {}),
        });
      }

      case "new": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            owner: { type: "string", multiple: true },
            description: { type: "string" },
          },
          allowPositionals: true,
          strict: true,
        });
        const name = positionals[0];
        if (!name) {
          console.error("new: missing skill name\n\n" + HELP);
          return 2;
        }
        const owners = (values.owner ?? []) as string[];
        if (owners.length === 0) {
          console.error("new: --owner is required (e.g. --owner @org/team)\n\n" + HELP);
          return 2;
        }
        return newCommand({
          skillName: name,
          owners,
          ...(values.description ? { description: values.description } : {}),
        });
      }

      case "validate": {
        const { positionals } = parseArgs({
          args: rest,
          options: {},
          allowPositionals: true,
          strict: true,
        });
        return validateCommand(positionals[0] ? { skillName: positionals[0] } : {});
      }

      default:
        console.error(`Unknown command: ${command}\n\n${HELP}`);
        return 2;
    }
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exit(code);
});
