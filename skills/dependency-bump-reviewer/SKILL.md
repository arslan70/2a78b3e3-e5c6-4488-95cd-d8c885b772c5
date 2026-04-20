---
name: dependency-bump-reviewer
description: Review a dependency-bump pull request (Renovate, Dependabot, or a manual version bump in package.json, pyproject.toml, go.mod, Gemfile, or Cargo.toml) and produce a breaking-change summary plus a test checklist grounded in the real changelog. Trigger when the diff is primarily a manifest version change and the PR title or branch name looks like a bump (`renovate/`, `dependabot/`, `chore(deps):`, `bump <lib>`). Do NOT trigger on PRs that add a new dependency, remove one, or change application code alongside the bump — those need human design review, not a changelog summary.
---

**Emit your review using the literal template below — one block per bumped library, in this exact shape, with no extra prose before or after. Do not add, omit, or rename fields. If a section has no entries, keep the heading and write `none`.**

## Output template

~~~
### <library>: <old_version> → <new_version>

Verdict: <safe | review | blocking>
Source: <release-notes | web-search>
Baseline (pre-bump): <lint/type-check/test result — pass/fail + counts>

Transitive peers:
- <plugin>@<version>: peer `<range>` → <ok | excludes new>  (<file>:<line>)
- ...

Breaking:
- <one-line summary> — hits: <file:line, ...> | no static hits
- ...

Noteworthy:
- <one-line summary> — hits: <file:line, ...> | no static hits
- ...

Test checklist:
- [ ] <test derived from the changed surface>
- [ ] ...

Routes to: <@org/team from the REVIEWED repo's .github/CODEOWNERS for the bumped manifest, or 'no owner (default reviewers)'>
~~~

## Worked example

Realistic output for `zod: 3.23.8 → 4.0.0` in a repo with no Zod usage and a clean baseline:

~~~
### zod: 3.23.8 → 4.0.0

Verdict: review
Source: release-notes
Baseline (pre-bump): npm test passed (142 / 142)

Transitive peers:
none

Breaking:
- `z.string().email()` now validates per the HTML5 spec — hits: no static hits
- `z.record()` requires an explicit key schema — hits: no static hits

Noteworthy:
- Drops Node 18 support; requires Node 20+ — hits: package.json:1 (no `engines` declared)

Test checklist:
- [ ] Re-run the full test suite and type-check
- [ ] Exercise any form-validation flows in dev

Routes to: @acme/backend-platform
~~~

## How to produce the review

1. Parse the diff to extract every `(library, old_version, new_version)` tuple. Ignore indirect lockfile churn unless the lockfile is the only file changed.

2. **Pull the changelog** between `old_version` and `new_version` from the library's authoritative release notes. Do not use `context7-docs` here — Context7 indexes library *documentation*, not release notes, and a docs snippet is not a changelog. Try sources in this order and record which one in `Source:`:
   a. `release-notes` — the library's `CHANGELOG.md`, GitHub release page (`https://github.com/<owner>/<repo>/releases/tag/v<new_version>`), or the library's release blog (e.g. `https://eslint.org/blog/<yyyy>/<mm>/eslint-v<new>-released/`). This is the authoritative source; always start here.
   b. `web-search` — a targeted search for `<library> <new_version> breaking changes`, only when the library publishes neither a changelog nor tagged GitHub releases.

3. **Transitive peer check (required).** A direct dependency's own peer range is not enough — its bundled plugins often gate compatibility tighter, and that is where real blockers hide. For each bumped library, inspect the installed manifests of its transitive plugins/peers and confirm `new_version` falls inside every peer range:
   - **JavaScript/TypeScript:** read `node_modules/<transitive>/package.json` (or the lockfile entries) for each child the bumped package pulls in; cite each `peerDependencies` range verbatim with a `file:line` reference.
   - **Python:** run `pip show <package>` (or read `*.dist-info/METADATA`) for each extra the package installs; flag any `Requires-Dist` range that excludes `new_version`.
   - **Go:** `go list -m all` and flag indirect modules whose constraints exclude the new version.

4. **Baseline.** Before classifying impact, run the project's lint/type-check/test command once on the current (pre-bump) tree and record the result (pass/fail + counts). A clean baseline is what turns later failures into real signal.

5. Classify every entry in the changelog as one of:
   - **Breaking** — API removed, renamed, signature changed, or behavior changed in a non-backward-compatible way. Goes in the `Breaking:` section.
   - **Noteworthy** — new required config, deprecation warnings, runtime requirement bumps (Node, Python, OS). Goes in the `Noteworthy:` section.
   - **Safe** — bug fix, internal refactor, docs, dependency-of-dependency bump. Omit entirely.

6. For each Breaking or Noteworthy entry, grep the repo for the affected symbols/flags/config keys and list `file:line` hits. If there are zero hits, write `no static hits` — do not imply the upgrade is risk-free, just that the static check found nothing.

7. **Ground the test checklist with `context7-docs`.** This is the composition point and it is separate from step 2. For each Breaking entry that has static hits (or for any symbol whose new-version shape the reviewer needs to verify), invoke `context7-docs` with the library name and `new_version` and the affected topic. Use the returned version-pinned snippets to write the `Test checklist` item so it reflects the real v`new_version` API surface rather than a guess. If Context7 does not index `new_version`, fall back per that skill's own rules and add `(docs-pinned to <fallback_version>)` on the test checklist item so the reviewer knows the grounding is drift-adjacent. Changelog goes in `Source:`; docs grounding does not — they are different evidence.

8. **Verdict rule.** Set `Verdict:`:
   - `blocking` — any transitive peer excludes `new_version`, OR the baseline fails, OR a Breaking entry has repo hits that cannot be fixed in this PR.
   - `review` — Breaking entries exist but have no static hits, OR Noteworthy entries have hits, OR the baseline has pre-existing warnings worth calling out.
   - `safe` — no Breaking, no Noteworthy, all peers ok, baseline clean.

9. **Route to owners.** Look up the owning team in the **reviewed repo's** `.github/CODEOWNERS` for the bumped manifest path. Name it in `Routes to:`. If no CODEOWNERS entry matches, write `no owner (default reviewers)`. Do not invent a team; do not read the skill-catalog's own CODEOWNERS.

Do NOT approve or merge the PR. This skill produces a review draft; the CODEOWNERS-resolved human owner makes the call.
