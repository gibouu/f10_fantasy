import test from "node:test"
import assert from "node:assert/strict"

import {
  actualResultLabel,
  formatScoreChip,
  scoreTone,
  totalScoreFromBreakdown,
} from "./picks-display-view.mjs"

test("PicksDisplay renders score chips from actual score values", () => {
  assert.equal(scoreTone(8), "positive")
  assert.equal(scoreTone(0), "neutral")
  assert.equal(formatScoreChip(8), "+8")
  assert.equal(formatScoreChip(0), "+0")
})

test("PicksDisplay formats actual result labels for classified and non-finish rows", () => {
  assert.equal(actualResultLabel({ driverId: "driver-1", position: 10, status: "CLASSIFIED" }), "P10")
  assert.equal(actualResultLabel({ driverId: "driver-1", position: null, status: "DNF" }), "DNF")
  assert.equal(actualResultLabel(null), "—")
})

test("PicksDisplay falls back to zero total when a completed pick is unscored", () => {
  assert.equal(totalScoreFromBreakdown({ totalScore: 18 }), 18)
  assert.equal(totalScoreFromBreakdown(null), 0)
})
