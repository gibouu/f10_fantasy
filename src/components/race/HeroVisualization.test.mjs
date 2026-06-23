import test from "node:test"
import assert from "node:assert/strict"

import {
  isActualResultPending,
  isMissingCompletedResult,
  isPickResultMatched,
} from "./hero-visualization-view.mjs"

test("HeroVisualization treats missing completed result bubbles as resolved placeholders", () => {
  assert.equal(isMissingCompletedResult("COMPLETED", null), true)
  assert.equal(isActualResultPending("COMPLETED", null), false)
  assert.equal(isActualResultPending("UPCOMING", null), true)
})

test("HeroVisualization only marks picks as matched against completed concrete results", () => {
  assert.equal(isPickResultMatched("COMPLETED", "driver-1", "driver-1"), true)
  assert.equal(isPickResultMatched("COMPLETED", "driver-1", null), false)
  assert.equal(isPickResultMatched("LIVE", "driver-1", "driver-1"), false)
  assert.equal(isPickResultMatched("COMPLETED", null, "driver-1"), false)
})
