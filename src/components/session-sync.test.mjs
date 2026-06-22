import test from "node:test"
import assert from "node:assert/strict"

import { shouldRefreshForSessionStatus } from "./session-sync.js"

test("shouldRefreshForSessionStatus only refreshes when entering authenticated", () => {
  const sequence = [
    "loading",
    "unauthenticated",
    "authenticated",
    "authenticated",
    "unauthenticated",
    "authenticated",
  ]
  const refreshes = []
  let previous = sequence[0]

  for (const status of sequence.slice(1)) {
    if (shouldRefreshForSessionStatus(previous, status)) {
      refreshes.push({ previous, status })
    }
    previous = status
  }

  assert.deepEqual(refreshes, [
    { previous: "unauthenticated", status: "authenticated" },
    { previous: "unauthenticated", status: "authenticated" },
  ])
  assert.equal(shouldRefreshForSessionStatus("loading", "authenticated"), true)
  assert.equal(shouldRefreshForSessionStatus("authenticated", "authenticated"), false)
  assert.equal(shouldRefreshForSessionStatus("authenticated", "unauthenticated"), false)
})
