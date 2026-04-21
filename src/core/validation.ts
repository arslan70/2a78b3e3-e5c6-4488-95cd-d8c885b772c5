/**
 * Skill names are also path segments — they are joined into filesystem
 * paths in install/uninstall/run/doctor. Anything outside a strict
 * kebab-case alphabet would let a caller escape the skills root
 * (e.g. `../victim` under uninstall would `rm -rf` a sibling directory),
 * so we enforce the same shape the catalog already uses for folder names.
 */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_RE.test(name);
}

export function assertValidSkillName(name: string): void {
  if (!isValidSkillName(name)) {
    throw new Error(
      `Invalid skill name "${name}". Must match ${SKILL_NAME_RE} (lowercase kebab-case, no slashes or dots).`,
    );
  }
}
