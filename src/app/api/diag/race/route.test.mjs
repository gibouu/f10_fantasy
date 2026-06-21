import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8")

test("race diagnostics skip lock-picks heuristics for cancelled races", () => {
  assert.match(
    source,
    /const lockPicksOwnsRace = race\.status === "UPCOMING" \|\| race\.status === "LIVE"/,
  )
  assert.match(source, /lockPicksOwnsRace &&\s*startedScheduled/s)
  assert.match(source, /lockPicksOwnsRace &&\s*lockCutoffPassed/s)
  assert.doesNotMatch(source, /race\.status !== "COMPLETED" &&\s*startedScheduled/s)
})
