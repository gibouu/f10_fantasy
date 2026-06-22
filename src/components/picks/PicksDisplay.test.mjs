import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./PicksDisplay.tsx", import.meta.url), "utf8")

test("PicksDisplay does not carry unused maxScore row props", () => {
  assert.doesNotMatch(source, /getScoringCaps/)
  assert.doesNotMatch(source, /maxScore/)
})
