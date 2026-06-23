import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")

function upsertBlock() {
  const start = route.indexOf("let existing = await db.race.findFirst")
  const end = route.indexOf("// ── 6.5. Reconcile orphan races", start)

  assert.notEqual(start, -1, "expected existing-race lookup block")
  assert.notEqual(end, -1, "expected reconcile section after upsert block")

  return route.slice(start, end)
}

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
