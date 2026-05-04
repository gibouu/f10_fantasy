/**
 * One-time backfill for PickSet rows that were locked BEFORE the locked* /
 * snapshot columns existed. For those rows, we have no separate pre-lock
 * state — the live driver/seat fields are the only state we know — so we
 * copy them into the locked* columns. Future locks (cron) populate the
 * snapshot atomically with the lockedAt write, so no further backfill is
 * needed.
 *
 *   npx tsx scripts/backfill-locked-snapshots.ts
 *
 * Idempotent: WHERE clause skips rows whose snapshot is already populated.
 */
import { db } from '@/lib/db/client'

async function main() {
  const before = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "PickSet"
    WHERE "lockedAt" IS NOT NULL
      AND "lockedTenthPlaceDriverId" IS NULL
  `
  const targetCount = Number(before[0]?.count ?? 0)
  console.log(`Locked PickSets needing snapshot backfill: ${targetCount}`)

  if (targetCount === 0) {
    console.log('Nothing to do.')
    return
  }

  const updated = await db.$executeRaw`
    UPDATE "PickSet"
    SET "lockedTenthPlaceDriverId" = "tenthPlaceDriverId",
        "lockedTenthPlaceSeatKey"  = "tenthPlaceSeatKey",
        "lockedWinnerDriverId"     = "winnerDriverId",
        "lockedWinnerSeatKey"      = "winnerSeatKey",
        "lockedDnfDriverId"        = "dnfDriverId",
        "lockedDnfSeatKey"         = "dnfSeatKey"
    WHERE "lockedAt" IS NOT NULL
      AND "lockedTenthPlaceDriverId" IS NULL
  `

  console.log(`Backfilled ${Number(updated)} row(s).`)

  // Verify post-state.
  const drift = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "PickSet"
    WHERE "lockedAt" IS NOT NULL
      AND ("lockedTenthPlaceDriverId" IS NULL
        OR "lockedWinnerDriverId" IS NULL
        OR "lockedDnfDriverId" IS NULL)
  `
  const remaining = Number(drift[0]?.count ?? 0)
  if (remaining > 0) {
    throw new Error(`${remaining} locked PickSet(s) still missing snapshot — investigate.`)
  }
  console.log('All locked PickSets now have a populated snapshot.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
