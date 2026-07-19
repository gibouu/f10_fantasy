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
const driverFormSheetSource = await readFile(
  new URL("./FXRacing/Features/Races/DriverFormSheet.swift", import.meta.url),
  "utf8",
).catch(() => "")
const performanceFixtures = await readFile(
  new URL("./FXRacing/Performance/PerformanceFixtures.swift", import.meta.url),
  "utf8",
)
const seasonFormSource = contextSource.match(
  /private struct SeasonFormContextView[\s\S]*?(?=private struct CompactScoreContextView)/,
)?.[0]

assert.ok(seasonFormSource, "SeasonFormContextView source should be present")

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
  assert.match(driverSource, /let seasonResults: \[DriverSeasonResult\]\?/)
  assert.match(driverSource, /seasonResults: \[DriverSeasonResult\]\? = nil/)
})

test("season form and driver history stay image-free and do not create remote image work", () => {
  assert.doesNotMatch(seasonFormSource, /DriverBubbleView|FXRemoteImage/)
  assert.doesNotMatch(driverFormSheetSource, /DriverBubbleView|FXRemoteImage/)
  assert.match(seasonFormSource, /driver\.teamColor/)
})

test("season form rows are full-width accessible buttons that open native history", () => {
  assert.match(seasonFormSource, /Button\s*\{[\s\S]*?selectedDriver\s*=\s*driver/)
  assert.match(seasonFormSource, /Image\(systemName:\s*"chevron\.right"\)/)
  assert.match(seasonFormSource, /\.frame\(maxWidth:\s*\.infinity[\s\S]*?minHeight:\s*44/)
  assert.match(seasonFormSource, /\.buttonStyle\(\.plain\)/)
  assert.match(contextSource, /\.sheet\(item:\s*\$selectedDriver\)/)
  assert.match(contextSource, /DriverFormSheet\(race:\s*race,\s*driver:\s*driver\)/)
  assert.match(contextSource, /Text\("OUT"\)/)
  assert.match(contextSource, /non-classified results/)
})

test("driver history is an opaque native sheet that preserves server ordering", () => {
  assert.match(driverFormSheetSource, /struct DriverFormSheet:\s*View/)
  assert.match(driverFormSheetSource, /let race:\s*Race/)
  assert.match(driverFormSheetSource, /let driver:\s*Driver/)
  assert.match(driverFormSheetSource, /driver\.seasonResults/)
  assert.doesNotMatch(driverFormSheetSource, /\.sorted\s*\(/)
  assert.match(driverFormSheetSource, /AVG uses classified finishes\./)
  assert.match(driverFormSheetSource, /Race results before/)
  assert.match(driverFormSheetSource, /Sprint results before/)
  assert.match(driverFormSheetSource, /No completed races yet\./)
  assert.match(driverFormSheetSource, /No completed sprints yet\./)
  assert.match(driverFormSheetSource, /\.presentationDetents\(\[\.medium,\s*\.large\]\)/)
  assert.match(driverFormSheetSource, /\.presentationBackground\(Color\(\.systemBackground\)\)/)
})

test("season form adapts to Dynamic Type without fixed typography or stat columns", () => {
  assert.doesNotMatch(seasonFormSource, /\.font\(\.system\(size:/)
  assert.doesNotMatch(seasonFormSource, /\.frame\(width:\s*(?:44|36)\b/)
  assert.match(seasonFormSource, /ViewThatFits\(in:\s*\.horizontal\)/)
  assert.match(seasonFormSource, /@Environment\(\\\.dynamicTypeSize\)/)
  assert.match(seasonFormSource, /dynamicTypeSize\.isAccessibilitySize/)
  assert.match(seasonFormSource, /\.font\(\.caption/)
  assert.match(seasonFormSource, /\.font\(\.subheadline/)
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
  assert.match(performanceFixtures, /seasonResults:\s*driver\.seasonResults/)
})
