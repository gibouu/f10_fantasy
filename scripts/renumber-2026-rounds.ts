/**
 * Renumber 2026 Race rows so the `round` field matches F1's official
 * 1-22 numbering (https://www.formula1.com/en/racing/2026.html).
 *
 * Context: `scripts/reconcile-2026-calendar.ts` inserts new races at
 * max(round)+1 to dodge the `[seasonId, round, type]` unique constraint.
 * Monaco lands at R25, Belgian at R27, Mexico at R28, etc. — chronologically
 * correct but visually wrong. The earlier rows that the orphan/reconcile work
 * left untouched also carry rounds from a stale provisional schedule.
 *
 * This script reassigns all non-CANCELLED rows to the F1-official round and
 * runs the writes in a single Prisma `$transaction` using a two-pass dance
 * to avoid colliding with the unique constraint:
 *
 *   Pass A: UPDATE id=X SET round = target + 1000  (parks each row in a
 *           guaranteed-free high slot — current max round is 28, +1000 is safe)
 *   Pass B: UPDATE id=X SET round = target          (lands at final F1 round)
 *
 * Why two passes: if Hungarian is moving R13 → R11 and Italian is moving
 * R16 → R13 simultaneously, a naive single-pass UPDATE would briefly violate
 * `[seasonId, round, type]` uniqueness when Italian tries to land on R13 while
 * Hungarian is still there. The high-slot parking step gives every row a
 * unique safe staging round.
 *
 * Status handling:
 *   - UPCOMING + COMPLETED rows: renumbered. (COMPLETED's round is purely a
 *     display label; nothing in result/entry data is touched. Architecture
 *     rule "Completed races are immutable" is about results/entries, not
 *     about cosmetic round labels.)
 *   - CANCELLED rows: moved out of the way to high unique slots (CANCELLED_PARK
 *     onwards) so they can't block a UPCOMING/COMPLETED row from landing on
 *     its F1-official round. The UI hides CANCELLED rows so the high label
 *     never surfaces. Idempotent — rows already at or above CANCELLED_PARK
 *     are left alone on re-runs.
 *
 * Safety:
 *   - Dry-run by default; --apply to commit.
 *   - Refuses to act if any expected F1-official race has no DB match
 *     (incomplete reconciliation — run `scripts/reconcile-2026-calendar.ts`
 *     first).
 *   - Refuses to act if the same target round + type would be assigned to
 *     more than one DB row (would violate unique constraint after Pass B).
 *
 * Run:
 *   npx tsx scripts/renumber-2026-rounds.ts          # dry-run
 *   npx tsx scripts/renumber-2026-rounds.ts --apply  # commit
 */
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local' })
loadDotenv({ path: '.env' })

import { db } from '@/lib/db/client'
import { getActiveSeason } from '@/lib/services/race.service'

// F1's official 2026 calendar — name (canonical) → F1 round.
// Source: https://www.formula1.com/en/racing/2026.html
// Sprint rows share their main weekend's round.
const F1_OFFICIAL_ROUNDS_2026: Record<string, number> = {
  'Australian Grand Prix': 1,
  'Chinese Grand Prix': 2,
  'Chinese Sprint': 2,
  'Japanese Grand Prix': 3,
  'Miami Grand Prix': 4,
  'Miami Sprint': 4,
  'Canadian Grand Prix': 5,
  'Canadian Sprint': 5,
  'Monaco Grand Prix': 6,
  'Barcelona Grand Prix': 7,
  'Austrian Grand Prix': 8,
  'British Grand Prix': 9,
  'British Sprint': 9,
  'Belgian Grand Prix': 10,
  'Hungarian Grand Prix': 11,
  'Dutch Grand Prix': 12,
  'Dutch Sprint': 12,
  'Italian Grand Prix': 13,
  // Spanish GP (Madrid) is F1's R14; the row is named "Spanish Grand Prix"
  // in our DB and OpenF1. The Barcelona-Catalunya weekend uses the distinct
  // name "Barcelona Grand Prix" (R7).
  'Spanish Grand Prix': 14,
  'Azerbaijan Grand Prix': 15,
  'Singapore Grand Prix': 16,
  'Singapore Sprint': 16,
  'United States Grand Prix': 17,
  'Mexico City Grand Prix': 18,
  'São Paulo Grand Prix': 19,
  'Las Vegas Grand Prix': 20,
  'Qatar Grand Prix': 21,
  'Abu Dhabi Grand Prix': 22,
}

const PARK_OFFSET = 1000
const CANCELLED_PARK = 9000

interface DbRace {
  id: string
  round: number
  type: string
  name: string
  status: string
  scheduledStartUtc: Date
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`)

  const season = await getActiveSeason()
  if (!season) {
    console.error('No active season found. Aborting.')
    process.exit(1)
  }
  console.log(`Active season: id=${season.id} year=${season.year}`)

  const rows = (await db.race.findMany({
    where: { seasonId: season.id },
    select: {
      id: true,
      round: true,
      type: true,
      name: true,
      status: true,
      scheduledStartUtc: true,
    },
    orderBy: { scheduledStartUtc: 'asc' },
  })) as DbRace[]

  console.log(`DB has ${rows.length} race row(s) for season ${season.year}`)

  // Plan: for each non-CANCELLED row, look up target round.
  interface Plan {
    row: DbRace
    targetRound: number
  }
  const plan: Plan[] = []
  const skippedCancelled: DbRace[] = []
  const unmatched: DbRace[] = []

  for (const r of rows) {
    if (r.status === 'CANCELLED') {
      skippedCancelled.push(r)
      continue
    }
    const target = F1_OFFICIAL_ROUNDS_2026[r.name]
    if (target === undefined) {
      unmatched.push(r)
      continue
    }
    plan.push({ row: r, targetRound: target })
  }

  // Validate: every F1-official race should have at least one DB match.
  const expectedNames = new Set(Object.keys(F1_OFFICIAL_ROUNDS_2026))
  const matchedNames = new Set(plan.map((p) => `${p.row.name}|${p.row.type}`))
  const missing: string[] = []
  for (const name of Array.from(expectedNames)) {
    const isSprint = name.endsWith(' Sprint')
    const wantType = isSprint ? 'SPRINT' : 'MAIN'
    if (!matchedNames.has(`${name}|${wantType}`)) {
      missing.push(`${name} (${wantType})`)
    }
  }

  // Validate: no two rows target the same (round, type).
  const collisionCheck = new Map<string, DbRace[]>()
  for (const p of plan) {
    const key = `${p.targetRound}|${p.row.type}`
    if (!collisionCheck.has(key)) collisionCheck.set(key, [])
    collisionCheck.get(key)!.push(p.row)
  }
  const collisions = Array.from(collisionCheck.entries()).filter(
    ([, rs]) => rs.length > 1,
  )

  // ─── Print plan ───
  console.log(`\n=== Plan ===`)
  console.log(
    `${plan.length} renumber(s), ${skippedCancelled.length} CANCELLED skipped, ${unmatched.length} unmatched, ${missing.length} F1 races missing from DB, ${collisions.length} target collision(s)`,
  )

  const changing = plan.filter((p) => p.row.round !== p.targetRound)
  const stable = plan.filter((p) => p.row.round === p.targetRound)

  if (changing.length > 0) {
    console.log('\n-- Round changes --')
    for (const p of changing) {
      console.log(
        `  ${p.row.id}  ${p.row.scheduledStartUtc.toISOString().slice(0, 10)}  ${p.row.type.padEnd(6)} ${p.row.name.padEnd(28)} R${String(p.row.round).padStart(2)} → R${String(p.targetRound).padStart(2)} (status=${p.row.status})`,
      )
    }
  }
  if (stable.length > 0) {
    console.log(`\n-- Already at target (${stable.length}) --`)
    for (const p of stable) {
      console.log(
        `  R${String(p.targetRound).padStart(2)} ${p.row.type.padEnd(6)} ${p.row.name}`,
      )
    }
  }
  if (unmatched.length > 0) {
    console.log('\n-- Unmatched (not in F1 official 2026 — left at current round) --')
    for (const r of unmatched) {
      console.log(
        `  ${r.id}  R${r.round} ${r.type}  ${r.name}  status=${r.status}`,
      )
    }
  }
  // Plan CANCELLED parks: any CANCELLED row currently below CANCELLED_PARK
  // gets moved to a unique slot in the 9000+ space. Idempotent: rows already
  // at or above CANCELLED_PARK stay where they are on re-runs.
  interface CancelledPark {
    row: DbRace
    targetRound: number
  }
  const cancelledToPark: CancelledPark[] = []
  let nextCancelledPark = CANCELLED_PARK
  // Bump past any existing CANCELLED rounds already in the park range.
  const existingHighRounds = skippedCancelled
    .map((r) => r.round)
    .filter((r) => r >= CANCELLED_PARK)
  if (existingHighRounds.length > 0) {
    nextCancelledPark = Math.max(...existingHighRounds) + 1
  }
  for (const r of skippedCancelled) {
    if (r.round < CANCELLED_PARK) {
      cancelledToPark.push({ row: r, targetRound: nextCancelledPark++ })
    }
  }

  if (cancelledToPark.length > 0) {
    console.log(
      `\n-- CANCELLED rows to park (${cancelledToPark.length}, moved to high unique slots so they don't block targets) --`,
    )
    for (const p of cancelledToPark) {
      console.log(
        `  ${p.row.id}  R${p.row.round} ${p.row.type}  ${p.row.name}  → R${p.targetRound}`,
      )
    }
  }
  const alreadyParkedCount = skippedCancelled.length - cancelledToPark.length
  if (alreadyParkedCount > 0) {
    console.log(
      `\n-- CANCELLED already parked at R${CANCELLED_PARK}+ (${alreadyParkedCount}, left as-is) --`,
    )
  }
  if (missing.length > 0) {
    console.log('\n-- ERROR: F1-official races with NO DB match --')
    for (const m of missing) console.log(`  ${m}`)
    console.error(
      '\nRefusing to apply: reconciliation is incomplete. Run scripts/reconcile-2026-calendar.ts --apply first.',
    )
    if (apply) process.exit(1)
  }
  if (collisions.length > 0) {
    console.log('\n-- ERROR: target round collisions (multiple rows want same (round, type)) --')
    for (const [key, rs] of collisions) {
      console.log(`  target=${key} → rows: ${rs.map((r) => r.id).join(', ')}`)
    }
    console.error(
      '\nRefusing to apply: would violate [seasonId, round, type] unique constraint.',
    )
    if (apply) process.exit(1)
  }

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply to commit)')
    return
  }

  if (changing.length === 0 && cancelledToPark.length === 0) {
    console.log('\nNothing to change.')
    return
  }

  // ─── Apply three-pass transaction ───
  console.log('\nApplying (3 passes: park CANCELLED → park changing → land)...')
  await db.$transaction(async (tx) => {
    // Pass 0: park CANCELLED rows out of the way.
    for (const p of cancelledToPark) {
      await tx.race.update({
        where: { id: p.row.id },
        data: { round: p.targetRound },
      })
    }
    // Pass A: park every changing row at target + PARK_OFFSET
    for (const p of changing) {
      await tx.race.update({
        where: { id: p.row.id },
        data: { round: p.targetRound + PARK_OFFSET },
      })
    }
    // Pass B: land at final target
    for (const p of changing) {
      await tx.race.update({
        where: { id: p.row.id },
        data: { round: p.targetRound },
      })
    }
  })
  console.log(
    `Applied: parked ${cancelledToPark.length} CANCELLED row(s); renumbered ${changing.length} active row(s) to F1-official rounds.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
