import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const contextSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceContextView.swift", import.meta.url),
  "utf8",
)
const deckSource = await readFile(
  new URL("./FXRacing/Features/Races/RaceDeckView.swift", import.meta.url),
  "utf8",
)
const driverSource = await readFile(
  new URL("./FXRacing/Core/Models/Driver.swift", import.meta.url),
  "utf8",
)
const performanceFixtures = await readFile(
  new URL("./FXRacing/Performance/PerformanceFixtures.swift", import.meta.url),
  "utf8",
)

test("upcoming races show season form before qualifying instead of previous-race data", () => {
  assert.match(contextSource, /case seasonForm/)
  assert.match(
    contextSource,
    /case \.upcoming:[\s\S]*hasQualifyingRows \? \.qualifying : \.seasonForm/,
  )
  assert.match(contextSource, /Text\("Season form"\)/)
  assert.match(contextSource, /seasonAverageFinish/)
  assert.match(contextSource, /seasonDnfCount/)
  assert.doesNotMatch(contextSource, /Text\("Last race"\)/)
  assert.doesNotMatch(deckSource, /previousDetail\(|previousRace\(/)
})

test("driver decoding remains compatible while carrying optional season form", () => {
  assert.match(driverSource, /let seasonAverageFinish: Double\?/)
  assert.match(driverSource, /let seasonDnfCount: Int\?/)
  assert.match(driverSource, /seasonAverageFinish: Double\? = nil/)
  assert.match(driverSource, /seasonDnfCount: Int\? = nil/)
})

test("gameplay review fixture mirrors the complete 22-driver 11-team field", () => {
  assert.match(performanceFixtures, /static let expectedEntrantCount = 22/)
  assert.match(performanceFixtures, /static let expectedConstructorCount = 11/)

  const expectedField = [
    "albon:23:williams",
    "alonso:14:astonMartin",
    "antonelli:12:mercedes",
    "bearman:87:haas",
    "bortoleto:5:audi",
    "bottas:77:cadillac",
    "colapinto:43:alpine",
    "gasly:10:alpine",
    "hadjar:6:redBull",
    "hamilton:44:ferrari",
    "hulkenberg:27:audi",
    "lawson:30:racingBulls",
    "leclerc:16:ferrari",
    "lindblad:41:racingBulls",
    "norris:1:mclaren",
    "ocon:31:haas",
    "perez:11:cadillac",
    "piastri:81:mclaren",
    "russell:63:mercedes",
    "sainz:55:williams",
    "stroll:18:astonMartin",
    "verstappen:3:redBull",
  ]
  const fixtureField = [
    ...performanceFixtures.matchAll(
      /Driver\(\s*id: "([^"]+)",[\s\S]*?number: (\d+),[\s\S]*?constructor: (\w+)\s*\)/g,
    ),
  ].map(([, id, number, constructor]) => `${id}:${number}:${constructor}`)

  assert.deepEqual(fixtureField.sort(), expectedField.sort())
  assert.equal(new Set(fixtureField).size, 22)
  assert.match(performanceFixtures, /seasonAverageFinish:/)
  assert.match(performanceFixtures, /seasonDnfCount:/)
})
