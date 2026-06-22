import test from "node:test"
import assert from "node:assert/strict"

import { rankRows } from "./leaderboard-rank.js"

function row(userId, overrides = {}) {
  return {
    userId,
    publicUsername: userId,
    avatarUrl: null,
    teamLogoUrl: null,
    teamColor: null,
    totalScore: 0,
    exactTenthHits: 0,
    winnerHits: 0,
    dnfHits: 0,
    ...overrides,
  }
}

test("rankRows assigns standard competition ranks to scoring ties", () => {
  const ranked = rankRows([
    row("charlie", { totalScore: 10 }),
    row("bravo", { totalScore: 20, exactTenthHits: 1 }),
    row("alpha", { totalScore: 20, exactTenthHits: 1 }),
    row("delta", { totalScore: 5 }),
  ])

  assert.deepEqual(
    ranked.map(({ userId, rank }) => ({ userId, rank })),
    [
      { userId: "alpha", rank: 1 },
      { userId: "bravo", rank: 1 },
      { userId: "charlie", rank: 3 },
      { userId: "delta", rank: 4 },
    ],
  )
})

test("rankRows uses scoring tiebreakers before shared-rank comparison", () => {
  const ranked = rankRows([
    row("alpha", { totalScore: 20, exactTenthHits: 1 }),
    row("bravo", { totalScore: 20, exactTenthHits: 2 }),
    row("charlie", { totalScore: 20, exactTenthHits: 1 }),
  ])

  assert.deepEqual(
    ranked.map(({ userId, rank }) => ({ userId, rank })),
    [
      { userId: "bravo", rank: 1 },
      { userId: "alpha", rank: 2 },
      { userId: "charlie", rank: 2 },
    ],
  )
})
