import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("sync-entries only selects race statuses whose grids can still change", () => {
  assert.match(route, /status:\s*\{\s*in:\s*\[\s*'UPCOMING',\s*'LIVE'\s*\]/s)
  assert.doesNotMatch(route, /status:\s*\{\s*not:\s*'COMPLETED'\s*\}/)
})

test("sync-entries skips partial provider entry sets before rewriting grids", () => {
  assert.match(route, /const MIN_VALID_ENTRY_COUNT = 10/)

  const rebuildBlock = route.match(/for \(const \{ race, drivers \} of sessionResults\) \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(rebuildBlock, "race entry rebuild loop should exist")

  const tooFewIndex = rebuildBlock.indexOf("entries.length < MIN_VALID_ENTRY_COUNT")
  const tooFewSkipIndex = rebuildBlock.indexOf("reason: `too-few-entries:${entries.length}`")
  const existingCountIndex = rebuildBlock.indexOf("const existingCount = race._count.entries")
  const regressionGuardIndex = rebuildBlock.indexOf("existingCount > 0 && entries.length < existingCount")
  const regressionSkipIndex = rebuildBlock.indexOf("reason: `entry-count-regression:${existingCount}->${entries.length}`")
  const deleteIndex = rebuildBlock.indexOf("db.raceEntry.deleteMany")

  assert.notEqual(tooFewIndex, -1, "suspiciously small provider results should be guarded")
  assert.notEqual(tooFewSkipIndex, -1, "too-few provider results should be reported as skipped")
  assert.notEqual(existingCountIndex, -1, "existing grid size should be considered")
  assert.notEqual(regressionGuardIndex, -1, "provider results that shrink an existing grid should be guarded")
  assert.notEqual(regressionSkipIndex, -1, "entry count regressions should be reported as skipped")
  assert.notEqual(deleteIndex, -1, "route should still rewrite valid grids")

  assert.ok(tooFewIndex < deleteIndex, "minimum-count guard should run before deleting entries")
  assert.ok(regressionGuardIndex < deleteIndex, "count-regression guard should run before deleting entries")
})
