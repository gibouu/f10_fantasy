import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8")

test("race detail route delegates HTTP behavior to the injected handler seam", () => {
  assert.match(source, /import \{ createRaceDetailGetHandler \} from '\.\/get-handler'/)
  assert.match(source, /export const GET = createRaceDetailGetHandler\(\{/)
})

test("race detail route wires season form and qualifying dependencies", () => {
  assert.match(source, /import \{ getDriverSeasonStats \}/)
  assert.match(source, /getQualifyingResults,/)
  assert.match(source, /getResultScoreGuide,/)
  assert.match(source, /findRaceResults,/)
})
