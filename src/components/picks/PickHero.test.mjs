import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./PickHero.tsx", import.meta.url), "utf8")

test("PickHero preserves unauthenticated picks across sign-in", () => {
  assert.match(source, /PENDING_PICK_STORAGE_PREFIX/)
  assert.match(source, /window\.localStorage\.setItem\(pendingPickStorageKey\(race\.id\), JSON\.stringify\(payload\)\)/)
  assert.match(source, /parsePendingPick\(window\.localStorage\.getItem\(storageKey\), race\.id\)/)
  assert.match(source, /submitPickPayload\(pendingPick\)/)
  assert.match(source, /window\.localStorage\.removeItem\(storageKey\)/)
})
