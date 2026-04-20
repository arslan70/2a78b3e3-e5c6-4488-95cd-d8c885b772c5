import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface SkillManifest {
  name: string;
  description: string;
}

export interface Skill {
  manifest: SkillManifest;
  path: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const KEY_LINE_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/;

/**
 * Parse a SKILL.md file. Codex only reads `name` and `description` from
 * frontmatter — we reject anything else to match the spec.
 * See: https://developers.openai.com/codex/skills/
 *
 * Supports single-line values, quoted values, and YAML block scalars
 * (`|` literal, `>` folded) so long descriptions can span multiple lines.
 * This is deliberately not a full YAML parser — AGENTS.md forbids runtime
 * dependencies and the surface we care about is tiny.
 */
export function parseSkillMd(content: string): SkillManifest {
  const match = FRONTMATTER_RE.exec(content);
  if (!match || !match[1]) {
    throw new Error("SKILL.md is missing YAML frontmatter");
  }

  const fields = new Map<string, string>();
  const lines = match[1].split("\n");
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    const keyMatch = KEY_LINE_RE.exec(raw);
    if (!keyMatch) {
      throw new Error(`Invalid frontmatter line: ${raw}`);
    }
    const key = keyMatch[1]!;
    const rawValue = (keyMatch[2] ?? "").trim();
    i++;

    let value: string;
    if (rawValue === "|" || rawValue === ">") {
      const collected: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? "";
        if (next.trim() === "") {
          collected.push("");
          i++;
          continue;
        }
        if (!/^\s/.test(next)) break;
        collected.push(next.replace(/^\s+/, ""));
        i++;
      }
      while (collected.length && collected[collected.length - 1] === "") {
        collected.pop();
      }
      value =
        rawValue === "|"
          ? collected.join("\n")
          : collected
              .join("\n")
              .replace(/\n{2,}/g, (m) => "\n".repeat(m.length - 1))
              .replace(/([^\n])\n(?!\n)/g, "$1 ");
    } else {
      value = rawValue;
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }
    }
    fields.set(key, value);
  }

  const allowed = new Set(["name", "description"]);
  for (const key of fields.keys()) {
    if (!allowed.has(key)) {
      throw new Error(
        `Unsupported frontmatter field "${key}". Codex reads only "name" and "description".`,
      );
    }
  }

  const name = fields.get("name");
  const description = fields.get("description");
  if (!name) throw new Error("SKILL.md frontmatter missing required field: name");
  if (!description) {
    throw new Error("SKILL.md frontmatter missing required field: description");
  }
  return { name, description };
}

export async function loadSkill(skillDir: string): Promise<Skill> {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    throw new Error(`No SKILL.md found in ${skillDir}`);
  }
  const content = await readFile(skillMdPath, "utf8");
  const manifest = parseSkillMd(content);
  return { manifest, path: skillDir };
}
