import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const pickerSource = await readFile(
  new URL("./FXRacing/Features/Races/DriverPickerSheet.swift", import.meta.url),
  "utf8",
)
const tintSource = await readFile(
  new URL("./FXRacing/Features/Races/PickSlot+Tint.swift", import.meta.url),
  "utf8",
)
const panelSource = await readFile(
  new URL("./FXRacing/Features/Races/RacePickPanel.swift", import.meta.url),
  "utf8",
)

// The picker auto-advances P1 -> P10 -> DNF. Before this, the only cue was two
// grey words differing by a single character, which players missed.
test("the picker marks the active slot with its colour, not just text", () => {
  assert.match(pickerSource, /state\.activeSlot\.tint/)
  assert.match(pickerSource, /in: Capsule\(\)/)
  assert.doesNotMatch(
    pickerSource,
    /Text\("Choose a driver for \\\(state\.activeSlot\.label\)"\)[\s\S]{0,120}foregroundStyle\(\.secondary\)/,
  )
})

test("the slot change animates but respects Reduce Motion", () => {
  assert.match(pickerSource, /@Environment\(\\\.accessibilityReduceMotion\)/)
  assert.match(pickerSource, /reduceMotion \? nil : /)
  assert.match(pickerSource, /value: state\.activeSlot/)
})

test("VoiceOver still announces which slot is being chosen", () => {
  assert.match(
    pickerSource,
    /accessibilityLabel\("Choose a driver for \\\(state\.activeSlot\.label\)"\)/,
  )
  assert.match(pickerSource, /accessibilityAddTraits\(\.isHeader\)/)
})

test("card and picker share one slot colour source", () => {
  assert.match(tintSource, /extension PickSlot[\s\S]*var tint: Color/)
  assert.match(tintSource, /case \.winner: FXTheme\.Colors\.accent/)
  assert.match(tintSource, /case \.p10:\s+FXTheme\.Colors\.gold/)
  assert.match(tintSource, /case \.dnf:\s+FXTheme\.Colors\.danger/)
  // The panel must use the shared value rather than keeping a private copy.
  assert.match(panelSource, /slot\.tint/)
  assert.doesNotMatch(panelSource, /private func slotColor/)
})
