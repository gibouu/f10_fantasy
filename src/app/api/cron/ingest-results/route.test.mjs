import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { shouldIngestRaceResults } from "./result-targets.js"

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("auto mode preserves the stale-LIVE result ingestion guard for qualifying targets", () => {
  const resultRaceIds = new Set(["stale-live"])

  assert.equal(
    shouldIngestRaceResults({
      mode: "auto",
      raceId: "qualifying-only-live",
      openf1SessionKey: 123,
      resultRaceIds,
    }),
    false,
  )
  assert.equal(
    shouldIngestRaceResults({
      mode: "auto",
      raceId: "stale-live",
      openf1SessionKey: 123,
      resultRaceIds,
    }),
    true,
  )
  assert.equal(
    shouldIngestRaceResults({
      mode: "targeted",
      raceId: "qualifying-only-live",
      openf1SessionKey: 123,
      resultRaceIds,
    }),
    true,
  )
  assert.equal(
    shouldIngestRaceResults({
      mode: "force",
      raceId: "qualifying-only-live",
      openf1SessionKey: 123,
      resultRaceIds,
    }),
    true,
  )
  assert.equal(
    shouldIngestRaceResults({
      mode: "force",
      raceId: "missing-session-key",
      openf1SessionKey: null,
      resultRaceIds,
    }),
    false,
  )
})

test("ingest-results route delegates final-result decisions to the target guard", () => {
  assert.match(route, /let resultRaceIds = new Set<string>\(\)/)
  assert.match(route, /resultRaceIds = new Set\(needResults\)/)
  assert.match(route, /const allowRaceResults = shouldIngestRaceResults\(\{/)
  assert.doesNotMatch(route, /race\.status === 'LIVE'/)
})
