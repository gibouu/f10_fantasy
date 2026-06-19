import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./find-cheated-picks.ts", import.meta.url), "utf8")
const driftQuery = source.match(
  /const drift = await db\.\$queryRaw<DriftRow\[]>`([\s\S]*?)ORDER BY r\."scheduledStartUtc" DESC/,
)?.[1]

assert.ok(driftQuery, "expected to find the snapshot drift SQL query")

test("snapshot drift query compares protected driver and seat snapshot fields", () => {
  for (const field of [
    "tenthPlaceDriverId",
    "lockedTenthPlaceDriverId",
    "winnerDriverId",
    "lockedWinnerDriverId",
    "dnfDriverId",
    "lockedDnfDriverId",
    "tenthPlaceSeatKey",
    "lockedTenthPlaceSeatKey",
    "winnerSeatKey",
    "lockedWinnerSeatKey",
    "dnfSeatKey",
    "lockedDnfSeatKey",
  ]) {
    assert.match(driftQuery, new RegExp(`ps\\."${field}"`))
  }

  for (const [liveField, lockedField] of [
    ["tenthPlaceDriverId", "lockedTenthPlaceDriverId"],
    ["winnerDriverId", "lockedWinnerDriverId"],
    ["dnfDriverId", "lockedDnfDriverId"],
    ["tenthPlaceSeatKey", "lockedTenthPlaceSeatKey"],
    ["winnerSeatKey", "lockedWinnerSeatKey"],
    ["dnfSeatKey", "lockedDnfSeatKey"],
  ]) {
    assert.match(
      driftQuery,
      new RegExp(
        `ps\\."${liveField}"\\s+IS DISTINCT FROM\\s+ps\\."${lockedField}"`,
      ),
    )
  }
})
