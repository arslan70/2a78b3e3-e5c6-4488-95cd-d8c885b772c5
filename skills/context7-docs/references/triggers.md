# Triggers — when `context7-docs` should and should not fire

These examples exist to keep the routing sharp. Add to this list when you spot a misfire in the wild.

## Fire

- "How do I do X with Next.js App Router?" — Next.js is in `package.json`, and App Router APIs change often. Pinned version matters.
- "Upgrade the Django version from 4.2 to 5.1" — the whole question is about drift between two specific versions.
- "Why is my Pydantic v2 validator not running?" — Pydantic v2 changed validator semantics; stale training data will mislead.
- "Write a Prisma schema for this model" — Prisma's schema DSL is versioned and evolves.

## Do NOT fire

- "Convert this dict to JSON in Python." — stdlib, no manifest dependency.
- "Why is my `for` loop off by one?" — no library at all.
- "Format this string in TypeScript." — language feature, not a library.
- "I'm exploring ideas for a new tool." — no repo context, no manifest, no specific library.

## Borderline — prefer to fire only if the user actually names the library

- "How should I structure tests?" — fire only if the user names the test framework (pytest, Playwright, Vitest) and it is in the manifest.
- "Add a retry to this function." — fire only if the user asks for a specific retry library (`tenacity`, `p-retry`) that is installed.

## The rule behind the examples

Fire when **(a)** the answer depends on version-specific behavior **and** **(b)** the repo's manifest pins that version. If either leg is missing, the skill adds noise, not signal.
