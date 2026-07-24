import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")

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

  assert.match(block, /select: \{ id: true, status: true \}/)
  assert.match(
    block,
    /if \(existing\) \{\s*raceId = existing\.id\s*if \(existing\.status !== "COMPLETED"\) \{\s*await db\.race\.update\(/,
  )
  assert.match(
    block,
    /raceIdBySessionKey\.set\(session\.sessionKey, raceId\)\s*synced\+\+/,
  )
})
