import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeLeaderboardScope,
  normalizeLeaderboardSort,
} from "./search-params.js"

test("normalizeLeaderboardSort defaults unsupported sort values to season", () => {
  assert.equal(normalizeLeaderboardSort("not-a-supported-sort", ["race-1"]), "season")
  assert.equal(normalizeLeaderboardSort("", ["race-1"]), "season")
  assert.equal(normalizeLeaderboardSort(undefined, ["race-1"]), "season")
})

test("normalizeLeaderboardSort accepts season and completed race ids", () => {
  assert.equal(normalizeLeaderboardSort("season", ["race-1"]), "season")
  assert.equal(normalizeLeaderboardSort("race-1", ["race-1"]), "race-1")
})

test("normalizeLeaderboardSort uses only the first repeated query value", () => {
  assert.equal(normalizeLeaderboardSort(["race-1", "race-2"], ["race-1", "race-2"]), "race-1")
  assert.equal(normalizeLeaderboardSort(["bad", "race-1"], ["race-1"]), "season")
})

test("normalizeLeaderboardScope only allows friends scope for signed-in users", () => {
  assert.equal(normalizeLeaderboardScope("friends", true), "friends")
  assert.equal(normalizeLeaderboardScope(["friends", "global"], true), "friends")
  assert.equal(normalizeLeaderboardScope("friends", false), "global")
  assert.equal(normalizeLeaderboardScope("bad", true), "global")
})
