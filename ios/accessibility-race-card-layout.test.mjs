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
  assert.match(metricsSource, /case \.accessibility5:\s*1_160/)
  assert.match(metricsSource, /@unknown default:\s*1_160/)
})

test("accessibility pick status rail keeps a positive bottom inset inside the card", () => {
  assert.match(
    pickPanelSource,
    /accessibilityFooterBottomInset/,
    "The pick panel should reserve explicit bottom space after every status variant at accessibility sizes",
  )
  assert.match(
    pickPanelSource,
    /RacePickStatusRail\(status:\s*pickStatus,\s*onAction:\s*handleStatusAction\)[\s\S]*?\.padding\(\.bottom,\s*accessibilityFooterBottomInset\)/,
    "Status rail needs a bottom inset so titles such as Choose 3 more do not touch or cross the card clip",
  )
})
