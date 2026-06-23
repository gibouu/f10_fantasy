import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./race-summary.mapper.ts", import.meta.url),
  "utf8",
)
const raceServiceSource = await readFile(
  new URL("./race.service.ts", import.meta.url),
  "utf8",
)
const pickServiceSource = await readFile(
  new URL("./pick.service.ts", import.meta.url),
  "utf8",
)

test("mapRaceToSummary is the shared service-layer RaceSummary projection", () => {
  assert.match(source, /export type RaceSummaryInput = \{/)
  assert.match(
    source,
    /export function mapRaceToSummary\(race: RaceSummaryInput\): RaceSummary \{/,
  )
  assert.match(source, /type:\s*race\.type as RaceType/)
  assert.match(source, /status:\s*race\.status as RaceStatus/)
  assert.match(source, /scheduledStartUtc:\s*race\.scheduledStartUtc/)
  assert.match(source, /lockCutoffUtc:\s*race\.lockCutoffUtc/)
  assert.match(source, /qualifyingStartUtc:\s*race\.qualifyingStartUtc \?\? null/)
})

test("race and pick services use the shared RaceSummary mapper", () => {
  for (const serviceSource of [raceServiceSource, pickServiceSource]) {
    assert.match(
      serviceSource,
      /import \{ mapRaceToSummary \} from '\.\/race-summary\.mapper'/,
    )
    assert.doesNotMatch(
      serviceSource,
      /function mapRace(?:ToSummary)?\(race: \{/,
    )
  }
})
