/**
 * Diagnostic: list PickSet rows where `updatedAt` lands meaningfully after
 * `lockedAt` -- i.e. someone wrote to the row AFTER the lock-picks cron locked
 * it. This is the only reliable post-lock-edit signal, because Prisma's
 * `@updatedAt` is bumped on every row write -- including the cron's own
 * `lockedAt` write -- so naive `updatedAt > lockCutoffUtc` checks falsely
 * flag every legitimately-locked pick.
 *
 * The cron writes `lockedAt` and bumps `updatedAt` within the same statement
 * (delta ~1ms). A real post-lock user edit would push `updatedAt` hundreds of
 * ms or seconds past `lockedAt`. We use a 500ms tolerance as the cheat signal.
 *
 * Run: `npx tsx scripts/find-cheated-picks.ts`
 * Reads DATABASE_URL from local .env / .env.local -- point at prod with care.
 */
import { db } from '@/lib/db/client'

const POST_LOCK_TOLERANCE_MS = 500

type Row = {
  pickSetId: string
  userId: string
  username: string | null
  raceId: string
  raceName: string
  raceType: string
  raceStatus: string
  scheduledStartUtc: Date
  lockCutoffUtc: Date
  pickUpdatedAt: Date
  lockedAt: Date
  totalScore: number | null
  msUpdatedAfterLocked: number
}

type DriftRow = {
  pickSetId: string
  userId: string
  username: string | null
  raceName: string
  raceType: string
  raceStatus: string
  liveTenth: string
  lockedTenth: string | null
  liveWinner: string
  lockedWinner: string | null
  liveDnf: string
  lockedDnf: string | null
}

async function main() {
  const rows = await db.$queryRaw<Row[]>`
    SELECT
      ps.id                                                              AS "pickSetId",
      ps."userId"                                                        AS "userId",
      u."publicUsername"                                                 AS "username",
      r.id                                                               AS "raceId",
      r.name                                                             AS "raceName",
      r.type::text                                                       AS "raceType",
      r.status::text                                                     AS "raceStatus",
      r."scheduledStartUtc"                                              AS "scheduledStartUtc",
      r."lockCutoffUtc"                                                  AS "lockCutoffUtc",
      ps."updatedAt"                                                     AS "pickUpdatedAt",
      ps."lockedAt"                                                      AS "lockedAt",
      sb."totalScore"                                                    AS "totalScore",
      EXTRACT(EPOCH FROM (ps."updatedAt" - ps."lockedAt")) * 1000        AS "msUpdatedAfterLocked"
    FROM "PickSet" ps
    JOIN "Race" r ON r.id = ps."raceId"
    JOIN "User" u ON u.id = ps."userId"
    LEFT JOIN "ScoreBreakdown" sb ON sb."pickSetId" = ps.id
    WHERE ps."lockedAt" IS NOT NULL
      AND EXTRACT(EPOCH FROM (ps."updatedAt" - ps."lockedAt")) * 1000 > ${POST_LOCK_TOLERANCE_MS}
    ORDER BY r."scheduledStartUtc" DESC, ps."updatedAt" DESC
  `

  // Drift detection: any locked PickSet whose live driver/seat fields no
  // longer match the snapshot. This is the unambiguous tampering signal --
  // the DB trigger should make it impossible, so any hit here means the
  // trigger is missing or was bypassed.
  const drift = await db.$queryRaw<DriftRow[]>`
    SELECT
      ps.id                          AS "pickSetId",
      ps."userId"                    AS "userId",
      u."publicUsername"             AS "username",
      r.name                         AS "raceName",
      r.type::text                   AS "raceType",
      r.status::text                 AS "raceStatus",
      ps."tenthPlaceDriverId"        AS "liveTenth",
      ps."lockedTenthPlaceDriverId"  AS "lockedTenth",
      ps."winnerDriverId"            AS "liveWinner",
      ps."lockedWinnerDriverId"      AS "lockedWinner",
      ps."dnfDriverId"               AS "liveDnf",
      ps."lockedDnfDriverId"         AS "lockedDnf"
    FROM "PickSet" ps
    JOIN "Race" r ON r.id = ps."raceId"
    JOIN "User" u ON u.id = ps."userId"
    WHERE ps."lockedAt" IS NOT NULL
      AND ps."lockedTenthPlaceDriverId" IS NOT NULL
      AND (
        ps."tenthPlaceDriverId" <> ps."lockedTenthPlaceDriverId" OR
        ps."winnerDriverId"     <> ps."lockedWinnerDriverId"     OR
        ps."dnfDriverId"        <> ps."lockedDnfDriverId"
      )
    ORDER BY r."scheduledStartUtc" DESC
  `

  if (rows.length === 0 && drift.length === 0) {
    console.log(
      `No post-lock anomalies found:\n` +
        `  - every locked PickSet has updatedAt within ${POST_LOCK_TOLERANCE_MS}ms of lockedAt\n` +
        `  - every locked PickSet's live driver/seat fields match the snapshot`,
    )
    return
  }

  if (rows.length > 0) {
    console.log(
      `[updatedAt drift] Found ${rows.length} PickSet(s) with updatedAt > lockedAt + ${POST_LOCK_TOLERANCE_MS}ms:\n`,
    )
    for (const r of rows) {
      const secondsAfterLocked = (Number(r.msUpdatedAfterLocked) / 1000).toFixed(1)
      console.log(
        `  [late-write] ${r.raceName} (${r.raceType}, ${r.raceStatus})  user=${r.username ?? r.userId}`,
      )
      console.log(`               pickSetId=${r.pickSetId}`)
      console.log(`               lockedAt =${r.lockedAt.toISOString()}`)
      console.log(`               updatedAt=${r.pickUpdatedAt.toISOString()}  (+${secondsAfterLocked}s after lock)`)
      console.log(`               storedScore=${r.totalScore ?? 'n/a'}\n`)
    }
  }

  if (drift.length > 0) {
    console.log(
      `[snapshot drift] Found ${drift.length} PickSet(s) where live driver IDs no longer match the locked snapshot — direct evidence of tampering (trigger missing/bypassed):\n`,
    )
    for (const d of drift) {
      console.log(
        `  [TAMPERED] ${d.raceName} (${d.raceType}, ${d.raceStatus})  user=${d.username ?? d.userId}`,
      )
      console.log(`             pickSetId=${d.pickSetId}`)
      if (d.liveTenth !== d.lockedTenth)
        console.log(`             tenthPlace: live=${d.liveTenth}  locked=${d.lockedTenth}`)
      if (d.liveWinner !== d.lockedWinner)
        console.log(`             winner    : live=${d.liveWinner}  locked=${d.lockedWinner}`)
      if (d.liveDnf !== d.lockedDnf)
        console.log(`             dnf       : live=${d.liveDnf}  locked=${d.lockedDnf}`)
      console.log()
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
