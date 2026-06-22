import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./RaceResultsCard.tsx", import.meta.url), "utf8")

test("RaceResultsCard uses supplied score guide for winner labels", () => {
  assert.match(source, /const guide = result\.scoreGuide \?\? getResultScoreGuide\(result, raceType\)/)
  assert.match(source, /ptsLabel = `\+\$\{guide\.winner\}W`/)
  assert.doesNotMatch(source, /caps\.winner/)
})
