import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")
const entryGuard = await readFile(new URL("../entry-refresh-guard.ts", import.meta.url), "utf8")

function seasonActivationBlock() {
  const start = route.indexOf("let season = await db.season.findFirst")
  const end = route.indexOf("// ── 2. Fetch sessions + meetings", start)

  assert.notEqual(start, -1, "expected season lookup block")
  assert.notEqual(end, -1, "expected provider fetch section after season block")

  return route.slice(start, end)
}

function upsertBlock() {
  const start = route.indexOf("let existing = await db.race.findFirst")
  const end = route.indexOf("// ── 6.5. Reconcile orphan races", start)

  assert.notEqual(start, -1, "expected existing-race lookup block")
  assert.notEqual(end, -1, "expected reconcile section after upsert block")

  return route.slice(start, end)
}

function entryRebuildBlock() {
  const start = route.indexOf("const raceEntries: { raceId: string; driverId: string }[] = []")
  const end = route.indexOf("return NextResponse.json({ synced, reconciled, year", start)

  assert.notEqual(start, -1, "expected race entry rebuild block")
  assert.notEqual(end, -1, "expected response after race entry rebuild block")

  return route.slice(start, end)
}

test("sync-schedule activates an existing inactive current-year season", () => {
  const block = seasonActivationBlock()

  assert.match(block, /select: \{ id: true, year: true, isActive: true \}/)
  assert.match(block, /else if \(!season\.isActive\) \{/)
  assert.match(
    block,
    /db\.season\.updateMany\(\{\s*where: \{ isActive: true, id: \{ not: season\.id \} \},\s*data: \{ isActive: false \},\s*\}\)/,
  )
  assert.match(
    block,
    /db\.season\.update\(\{\s*where: \{ id: season\.id \},\s*data: \{ isActive: true \},\s*select: \{ id: true, year: true, isActive: true \},\s*\}\)/,
  )
})

test("sync-schedule skips updates for completed existing races", () => {
  const block = upsertBlock()

  assert.match(
    block,
    /select: \{ id: true, status: true, _count: \{ select: \{ entries: true \} \} \}/,
  )
  assert.match(
    block,
    /if \(existing\) \{\s*raceId = existing\.id\s*existingEntryCount = existing\._count\.entries\s*if \(existing\.status !== "COMPLETED"\) \{\s*await db\.race\.update\(/,
  )
  assert.match(
    block,
    /raceIdBySessionKey\.set\(session\.sessionKey, raceId\)\s*entryCountByRaceId\.set\(raceId, existingEntryCount\)\s*synced\+\+/,
  )
})

test("sync-schedule skips partial provider entry sets before rewriting grids", () => {
  assert.match(route, /getRaceEntryRefreshSkipReason/)
  assert.match(entryGuard, /export const MIN_VALID_ENTRY_COUNT = 10/)
  assert.match(entryGuard, /nextCount < MIN_VALID_ENTRY_COUNT/)
  assert.match(entryGuard, /`too-few-entries:\$\{nextCount\}`/)
  assert.match(entryGuard, /existingCount > 0 && nextCount < existingCount/)
  assert.match(entryGuard, /`entry-count-regression:\$\{existingCount\}->\$\{nextCount\}`/)

  const block = entryRebuildBlock()
  const entriesIndex = block.indexOf("const entries = drivers")
  const guardIndex = block.indexOf("const skipReason = getRaceEntryRefreshSkipReason")
  const existingCountIndex = block.indexOf("existingCount: entryCountByRaceId.get(raceId) ?? 0")
  const nextCountIndex = block.indexOf("nextCount: entries.length")
  const skipIndex = block.indexOf("entryRefreshSkipped.push({ raceId, reason: skipReason })")
  const deleteIndex = block.indexOf("db.raceEntry.deleteMany")

  assert.notEqual(entriesIndex, -1, "route should build per-race candidate entries")
  assert.notEqual(guardIndex, -1, "partial provider results should be guarded")
  assert.notEqual(existingCountIndex, -1, "existing grid size should be considered")
  assert.notEqual(nextCountIndex, -1, "candidate grid size should be considered")
  assert.notEqual(skipIndex, -1, "guarded provider results should be reported as skipped")
  assert.notEqual(deleteIndex, -1, "route should still rewrite valid grids")

  assert.ok(guardIndex < deleteIndex, "entry guard should run before deleting entries")
})
