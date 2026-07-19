import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raceCardSource = await readFile(
  path.join(__dirname, "FXRacing/Features/Races/UpcomingRaceCard.swift"),
  "utf8",
)
const pickPanelSource = await readFile(
  path.join(__dirname, "FXRacing/Features/Races/RacePickPanel.swift"),
  "utf8",
)
const metricsSource = await readFile(
  path.join(__dirname, "FXRacing/Features/Races/UpcomingCardLayoutMetrics.swift"),
  "utf8",
)

test("upcoming race card has a dedicated accessibility layout path", () => {
  assert.match(raceCardSource, /dynamicTypeSize\.isAccessibilitySize/)
  assert.match(raceCardSource, /accessibilityHeader/)
  assert.match(raceCardSource, /normalHeader/)
  assert.match(
    raceCardSource,
    /\.frame\(maxWidth:\s*\.infinity,\s*minHeight:\s*cardHeight,\s*alignment:\s*\.topLeading\)/,
  )
  assert.doesNotMatch(
    raceCardSource,
    /\.frame\(maxWidth:\s*\.infinity,\s*minHeight:\s*cardHeight,\s*maxHeight:\s*cardHeight/,
  )
})

test("accessibility Schedule action remains a single explicit control", () => {
  assert.match(raceCardSource, /accessibilityScheduleButton/)
  assert.match(raceCardSource, /\.accessibilityLabel\("Schedule"\)/)
  assert.match(raceCardSource, /\.lineLimit\(1\)/)
  assert.match(raceCardSource, /\.minimumScaleFactor\(1\)/)
})

test("pick panel reflows its heading and rows for accessibility sizes", () => {
  assert.match(pickPanelSource, /@Environment\(\\\.dynamicTypeSize\)/)
  assert.match(pickPanelSource, /accessibilityProgress/)
  assert.match(pickPanelSource, /dynamicTypeSize\.isAccessibilitySize/)
  assert.match(pickPanelSource, /pickRowSpacing/)
})

test("largest accessibility height budget covers the reflowed card", () => {
  assert.match(metricsSource, /case \.accessibility5:\s*1_060/)
  assert.match(metricsSource, /@unknown default:\s*1_060/)
})
