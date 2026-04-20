---
name: context7-docs
description: Fetch up-to-date documentation for a third-party library from Context7 (https://context7.com) when the repo is about to use, upgrade, or migrate that library. Trigger when the user names a library or framework that appears in a dependency manifest (package.json, requirements.txt, pyproject.toml, go.mod, Gemfile, Cargo.toml) and the answer depends on current behavior — upgrade paths, new APIs, deprecations, breaking changes. Do NOT trigger for standard-library usage, for trivial syntax questions, or when no dependency manifest pins the library.
---

When this skill triggers:

1. Identify the library in question and read its installed version from the appropriate manifest:
   - `package.json` / `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` (JavaScript)
   - `pyproject.toml` / `uv.lock` / `poetry.lock` / `requirements.txt` (Python)
   - `go.mod` (Go), `Gemfile.lock` (Ruby), `Cargo.lock` (Rust)
   If no manifest pins a version, continue with `latest` and flag it in your response.

2. Prefer the Context7 MCP server if it is configured in this Codex install — call `resolve-library-id` with the library name, then `query-docs` with the returned id and the pinned version. The MCP endpoint is `https://mcp.context7.com/mcp` and requires `CONTEXT7_API_KEY`.

3. If the MCP server is not configured, run `scripts/fetch.sh <library> <version> <query>` from this skill's folder. The script resolves the library and prints Context7's JSON response to stdout.

4. **Query shape is load-bearing.** Context7 returns topic-scoped snippets, not full docs. Pass **one short phrase, ≤ 10 words, one topic per call** (e.g. `"app router middleware auth"`, `"server actions revalidation"`, `"async validators"`). Do NOT concatenate multiple questions into one query — long prose queries frequently time out and return nothing. If the user asks about several topics, split into separate `query-docs` calls and merge the results yourself.

5. **Version fallback.** If `query-docs` returns empty or errors with the pinned version (e.g. `/vercel/next.js/v16.2.3`), retry once without the version (`/vercel/next.js`), then bail out. Flag in your response that the snippets came from the latest indexed version, not the pinned one.

6. Cite the library name, the version you actually got snippets from (may differ from the pinned version after fallback), and the source (`context7 mcp` or `context7 http`) in your response. The reader must be able to audit what grounded your answer.

Fallbacks:

- If `scripts/fetch.sh` exits non-zero (rate-limited, library not on Context7, no network), say so explicitly in one line and fall back to the model's own knowledge — do not silently guess.
- If the installed version is older than anything Context7 indexes, fetch the closest version and flag the gap so the reader knows the docs are drift-adjacent.

See `references/triggers.md` for borderline examples of when this skill should and should not fire.
