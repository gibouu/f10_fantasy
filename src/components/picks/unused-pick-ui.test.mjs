import test from "node:test"
import assert from "node:assert/strict"
import { access } from "node:fs/promises"

const removedLegacyFiles = [
  new URL("./PickForm.tsx", import.meta.url),
  new URL("./ScoreBreakdown.tsx", import.meta.url),
]

test("legacy unused pick UI components stay removed", async () => {
  for (const file of removedLegacyFiles) {
    await assert.rejects(access(file), { code: "ENOENT" })
  }
})
