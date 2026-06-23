import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Races/RaceDetailViewModel.swift", import.meta.url),
  "utf8",
)

const loadBlock = source.match(/func load\(token:[\s\S]*?\n    \}/)?.[0]

test("RaceDetailViewModel leaves detail-load failures visible for retry", () => {
  assert.ok(loadBlock, "load(token:localPickStore:) should exist")
  assert.match(
    loadBlock,
    /catch \{\s*errorMessage = error\.localizedDescription[\s\S]*return\s*\}/,
    "detail request failures should set the retry error and stop before clearing state",
  )
})

test("RaceDetailViewModel clears stale pick state after a successful detail load", () => {
  assert.ok(loadBlock, "load(token:localPickStore:) should exist")

  const successIndex = loadBlock.indexOf("let detail: DetailResponse = try await")
  const resetIndex = loadBlock.indexOf("errorMessage = nil")
  const serverPickIndex = loadBlock.indexOf("// Populate selections: server pick takes precedence")
  const localFallbackIndex = loadBlock.indexOf("// Fall back to local pick")

  assert.notEqual(successIndex, -1, "successful detail request should be present")
  assert.notEqual(resetIndex, -1, "successful load should clear stale state")
  assert.notEqual(serverPickIndex, -1, "server pick fallback should be present")
  assert.notEqual(localFallbackIndex, -1, "local pick fallback should be present")
  assert.ok(successIndex < resetIndex, "reset should run only after detail succeeds")
  assert.ok(resetIndex < serverPickIndex, "reset should run before server pick repopulation")
  assert.ok(resetIndex < localFallbackIndex, "reset should run before local pick repopulation")

  const resetBlock = loadBlock.slice(resetIndex, serverPickIndex)
  for (const reset of [
    "errorMessage = nil",
    "serverPick = nil",
    "isLocalOnly = false",
    "selectedWinner = nil",
    "selectedP10 = nil",
    "selectedDNF = nil",
  ]) {
    assert.match(resetBlock, new RegExp(reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("RaceDetailViewModel still repopulates selections from a local pick after reset", () => {
  assert.ok(loadBlock, "load(token:localPickStore:) should exist")

  const localBlock = loadBlock.match(/\/\/ Fall back to local pick[\s\S]*?selectedDNF\s*=.*\n        \}/)?.[0]
  assert.ok(localBlock, "local pick fallback should exist")
  assert.match(localBlock, /isLocalOnly = !local\.synced/)
  assert.match(localBlock, /selectedWinner = entrants\.first \{ \$0\.id == local\.winnerId \}/)
  assert.match(localBlock, /selectedP10\s*= entrants\.first \{ \$0\.id == local\.p10Id \}/)
  assert.match(localBlock, /selectedDNF\s*= entrants\.first \{ \$0\.id == local\.dnfId \}/)
})
