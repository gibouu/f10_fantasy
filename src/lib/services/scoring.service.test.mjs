import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./scoring.service.ts", import.meta.url), "utf8")

const bulkScoringBody = source.match(
  /export async function computeAndStoreScoresForRace[\s\S]+?export async function recomputeScoreForPickSet/,
)?.[0]

const singlePickBody = source.match(
  /export async function recomputeScoreForPickSet[\s\S]+$/,
)?.[0]

test("bulk scoring resolves locked seat keys without live-driver inference", () => {
  assert.ok(bulkScoringBody, "computeAndStoreScoresForRace source not found")
  assert.match(
    bulkScoringBody,
    /resolveSeatKey\(\s*f\.tenthPlaceSeatKey,\s*f\.lockedTenthPlaceDriverId,\s*pickSet\.tenthPlaceDriver,\s*\)/,
  )
  assert.match(
    bulkScoringBody,
    /resolveSeatKey\(\s*f\.winnerSeatKey,\s*f\.lockedWinnerDriverId,\s*pickSet\.winnerDriver,\s*\)/,
  )
  assert.match(
    bulkScoringBody,
    /resolveSeatKey\(\s*f\.dnfSeatKey,\s*f\.lockedDnfDriverId,\s*pickSet\.dnfDriver,\s*\)/,
  )
})

test("single-pick recompute resolves locked seat keys without live-driver inference", () => {
  assert.ok(singlePickBody, "recomputeScoreForPickSet source not found")
  assert.match(
    singlePickBody,
    /resolveSeatKey\(\s*tenthSeatKey,\s*ps\.lockedTenthPlaceDriverId,\s*ps\.tenthPlaceDriver,\s*\)/,
  )
  assert.match(
    singlePickBody,
    /resolveSeatKey\(\s*winnerSeatKey,\s*ps\.lockedWinnerDriverId,\s*ps\.winnerDriver,\s*\)/,
  )
  assert.match(
    singlePickBody,
    /resolveSeatKey\(\s*dnfSeatKey,\s*ps\.lockedDnfDriverId,\s*ps\.dnfDriver,\s*\)/,
  )
})
