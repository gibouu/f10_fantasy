import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")
const entryGuard = await readFile(new URL("../entry-refresh-guard.ts", import.meta.url), "utf8")

test("sync-entries only selects race statuses whose grids can still change", () => {
  assert.match(route, /status:\s*\{\s*in:\s*\[\s*'UPCOMING',\s*'LIVE'\s*\]/s)
  assert.doesNotMatch(route, /status:\s*\{\s*not:\s*'COMPLETED'\s*\}/)
})

test("sync-entries skips partial provider entry sets before rewriting grids", () => {
  assert.match(route, /getRaceEntryRefreshSkipReason/)
  assert.match(entryGuard, /export const MIN_VALID_ENTRY_COUNT = 10/)
  assert.match(entryGuard, /nextCount < MIN_VALID_ENTRY_COUNT/)
  assert.match(entryGuard, /`too-few-entries:\$\{nextCount\}`/)
  assert.match(entryGuard, /existingCount > 0 && nextCount < existingCount/)
  assert.match(entryGuard, /`entry-count-regression:\$\{existingCount\}->\$\{nextCount\}`/)

  const rebuildBlock = route.match(/for \(const \{ race, drivers \} of sessionResults\) \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(rebuildBlock, "race entry rebuild loop should exist")

  const guardIndex = rebuildBlock.indexOf("const skipReason = getRaceEntryRefreshSkipReason")
  const existingCountIndex = rebuildBlock.indexOf("existingCount: race._count.entries")
  const nextCountIndex = rebuildBlock.indexOf("nextCount: entries.length")
  const skipIndex = rebuildBlock.indexOf("skipped.push({ raceId: race.id, reason: skipReason })")
  const deleteIndex = rebuildBlock.indexOf("db.raceEntry.deleteMany")

  assert.notEqual(guardIndex, -1, "partial provider results should be guarded")
  assert.notEqual(existingCountIndex, -1, "existing grid size should be considered")
  assert.notEqual(nextCountIndex, -1, "candidate grid size should be considered")
  assert.notEqual(skipIndex, -1, "guarded provider results should be reported as skipped")
  assert.notEqual(deleteIndex, -1, "route should still rewrite valid grids")

  assert.ok(guardIndex < deleteIndex, "entry guard should run before deleting entries")
})
