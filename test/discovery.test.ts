import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { userSkillsDir, projectSkillsDir, installRoot } from "../src/core/discovery.ts";

test("userSkillsDir defaults to ~/.codex/skills", () => {
  const prev = process.env["CODEX_HOME"];
  delete process.env["CODEX_HOME"];
  try {
    assert.equal(userSkillsDir(), join(homedir(), ".codex", "skills"));
  } finally {
    if (prev !== undefined) process.env["CODEX_HOME"] = prev;
  }
});

test("userSkillsDir respects CODEX_HOME env var", () => {
  const prev = process.env["CODEX_HOME"];
  process.env["CODEX_HOME"] = "/custom/codex";
  try {
    assert.equal(userSkillsDir(), "/custom/codex/skills");
  } finally {
    if (prev === undefined) delete process.env["CODEX_HOME"];
    else process.env["CODEX_HOME"] = prev;
  }
});

test("projectSkillsDir resolves to <cwd>/.agents/skills", () => {
  assert.equal(projectSkillsDir("/repo"), "/repo/.agents/skills");
});

test("installRoot picks correct path per scope", () => {
  assert.equal(installRoot("project", "/repo"), "/repo/.agents/skills");
  const prev = process.env["CODEX_HOME"];
  process.env["CODEX_HOME"] = "/home/x/.codex";
  try {
    assert.equal(installRoot("user"), "/home/x/.codex/skills");
  } finally {
    if (prev === undefined) delete process.env["CODEX_HOME"];
    else process.env["CODEX_HOME"] = prev;
  }
});
