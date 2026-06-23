import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Rankings/LeaderboardView.swift", import.meta.url),
  "utf8",
)

test("LeaderboardView loads global rankings for signed-out users", () => {
  const loadBlock = source.match(/private func loadIfAllowed\(\) async \{[\s\S]*?\n    \}/)?.[0]

  assert.ok(loadBlock, "loadIfAllowed should exist")
  assert.match(
    loadBlock,
    /guard vm\.scope == \.global \|\| authManager\.isAuthenticated else \{ return \}/,
    "global scope should be allowed without authentication",
  )
  assert.doesNotMatch(
    loadBlock,
    /guard authManager\.isAuthenticated else \{ return \}/,
    "a blanket auth guard would make global rankings unreachable for guests",
  )
  assert.match(loadBlock, /await vm\.load\(token: authManager\.accessToken\)/)
})

test("LeaderboardView only gates Friends ranking UI behind sign-in", () => {
  assert.match(
    source,
    /if vm\.scope == \.friends && !authManager\.isAuthenticated \{[\s\S]*Text\("Sign in to view friends"\)/,
    "the signed-out empty state should only apply to the Friends scope",
  )
  assert.doesNotMatch(
    source,
    /if !authManager\.isAuthenticated \{[\s\S]*Text\("Sign in to view friends"\)/,
    "global rankings should not enter the Friends sign-in branch",
  )
  assert.match(
    source,
    /if vm\.scope == \.friends \{[\s\S]*ToolbarItem\(placement: \.topBarTrailing\)/,
    "friend search actions should remain scoped to Friends",
  )
})
