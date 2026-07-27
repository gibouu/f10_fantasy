import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const iosDir = dirname(fileURLToPath(import.meta.url))
const racesDir = join(iosDir, "FXRacing", "Features", "Races")

const cards = ["UpcomingRaceCard.swift", "PastRaceCard.swift"]

async function readSource(name) {
  return readFile(join(racesDir, name), "utf8")
}

// The race cards live inside CenteredRacePager's horizontal ScrollView, which
// clips its content. A drop shadow there is sliced off flat at the viewport
// edge instead of fading, which on systemGroupedBackground reads as a hard grey
// line between the picks card and the Season form card. See issue #417.
for (const card of cards) {
  test(`${card} casts no drop shadow`, async () => {
    const source = await readSource(card)
    assert.ok(
      !/\.shadow\(/.test(source),
      `${card} must not use .shadow(...); the pager clips it into a hard edge`
    )
  })

  test(`${card} keeps an explicit border to separate it from the background`, async () => {
    const source = await readSource(card)
    assert.match(
      source,
      /\.strokeBorder\(\s*FXTheme\.Colors\.cardBorder\(isSelected: isSelected\)/,
      `${card} must keep the adaptive card border — it replaces the shadow`
    )
  })

  test(`${card} fills with the opaque elevated surface`, async () => {
    const source = await readSource(card)
    assert.match(
      source,
      /FXTheme\.Colors\.surfaceElevated/,
      `${card} must fill with surfaceElevated so the card stays opaque in light mode`
    )
  })
}

test("the race pager still clips its content, which is why the shadow cannot come back", async () => {
  const source = await readFile(join(racesDir, "CenteredRacePager.swift"), "utf8")
  assert.match(source, /ScrollView\(\.horizontal\)/)
  assert.ok(
    !/\.scrollClipDisabled\(\)/.test(source),
    "if scroll clipping is ever disabled, revisit the no-shadow rule above"
  )
})
