import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./backfill-locked-snapshots.ts", import.meta.url), "utf8")
const targetQuery = source.match(
  /const before = await db\.\$queryRaw<Array<\{ count: bigint \}>>`([\s\S]*?)`/,
)?.[1]
const updateQuery = source.match(
  /const updated = await db\.\$executeRaw`([\s\S]*?)`/,
)?.[1]
const verificationQuery = source.match(
  /const drift = await db\.\$queryRaw<Array<\{ count: bigint \}>>`([\s\S]*?)`/,
)?.[1]

assert.ok(targetQuery, "expected to find the target count query")
assert.ok(updateQuery, "expected to find the snapshot update query")
assert.ok(verificationQuery, "expected to find the post-state verification query")

test("backfill targets any locked row missing a driver or seat snapshot", () => {
  for (const query of [targetQuery, updateQuery, verificationQuery]) {
    assert.match(query, /"lockedAt" IS NOT NULL/)

    for (const field of [
      "lockedTenthPlaceDriverId",
      "lockedWinnerDriverId",
      "lockedDnfDriverId",
    ]) {
      assert.match(query, new RegExp(`"${field}" IS NULL`))
    }

    assert.match(query, /OR\s+"lockedWinnerDriverId" IS NULL/)
    assert.match(query, /OR\s+"lockedDnfDriverId" IS NULL/)

    for (const [liveField, lockedField] of [
      ["tenthPlaceSeatKey", "lockedTenthPlaceSeatKey"],
      ["winnerSeatKey", "lockedWinnerSeatKey"],
      ["dnfSeatKey", "lockedDnfSeatKey"],
    ]) {
      assert.match(
        query,
        new RegExp(`"${liveField}" IS NOT NULL[\\s\\S]*"${lockedField}" IS NULL`),
        `${lockedField} should be checked when ${liveField} exists`,
      )
    }
  }
})
