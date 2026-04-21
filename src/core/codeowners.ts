import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface CodeownersRule {
  pattern: string;
  owners: string[];
  lineNumber: number;
}

/**
 * Parse a subset of GitHub's CODEOWNERS format sufficient for our catalog:
 * blank lines and `#` comments are skipped; each remaining line is a
 * whitespace-separated `<pattern> <@owner>...` tuple. We do NOT support
 * section headers (`[Section]` / `^[Section]`) or negation (`!pattern`);
 * they are not used by the catalog and falling back silently on unknown
 * syntax would be worse than ignoring those lines.
 */
export function parseCodeowners(content: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("[") || line.startsWith("^[")) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || owners.length === 0) continue;
    rules.push({ pattern, owners, lineNumber: i + 1 });
  }
  return rules;
}

/**
 * Convert a CODEOWNERS glob to a regex. Supports `*` (single path segment),
 * `**` (any number of segments), and trailing `/` (directory-and-below).
 * This is a subset — enough for patterns like `*`, `/skills/foo/`,
 * `/skills/**`, `*.md` — not a full gitignore implementation.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*\*/g, "::DOUBLESTAR::").replace(/\*/g, "[^/]*").replace(/::DOUBLESTAR::/g, ".*");
  const suffix = pattern.endsWith("/") ? ".*" : "(?:/.*)?";
  return new RegExp(`^${body}${suffix}$`);
}

/**
 * Resolve owners for a repo-root-relative path (e.g. `/skills/foo/`).
 * Applies GitHub's "last matching rule wins" semantics.
 */
export function ownersFor(rules: CodeownersRule[], path: string): string[] {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  let matched: CodeownersRule | null = null;
  for (const rule of rules) {
    const pattern = rule.pattern.startsWith("/") ? rule.pattern : `/${rule.pattern}`;
    if (globToRegex(pattern).test(normalized)) {
      matched = rule;
    }
  }
  return matched ? matched.owners : [];
}

export async function loadCodeowners(repoRoot: string): Promise<CodeownersRule[]> {
  const path = `${repoRoot}/.github/CODEOWNERS`;
  if (!existsSync(path)) return [];
  return parseCodeowners(await readFile(path, "utf8"));
}
