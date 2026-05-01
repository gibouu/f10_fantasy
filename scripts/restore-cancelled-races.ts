/**
 * One-time data fix: restore the three Bahrain/Saudi Arabian races whose
 * status was incorrectly flipped from CANCELLED to LIVE by the lock-picks
 * cron at 2026-05-01T19:40Z (the first run after the IAM role was repaired).
 *
 * The cron's `where` clause used `status: { not: "COMPLETED" }`, which matched
 * CANCELLED races whose start time had passed; the LIVE-flip block then
 * silently overwrote them. Code fix in src/app/api/cron/lock-picks/route.ts
 * (status: { in: ["UPCOMING", "LIVE"] }) prevents recurrence.
 *
 * Run: `npx tsx scripts/restore-cancelled-races.ts`
 * Reads DATABASE_URL from local .env / .env.local.
 */
import { db } from '@/lib/db/client'

const NAMES_TO_RESTORE = [
  // Race id, name, type — match by all three to avoid touching anything else
  { id: 'cmnlzx0xz002m5tcq3otjqv43', name: 'Saudi Arabian Grand Prix', type: 'MAIN' },
] as const

async function main() {
  // Look up by name+type+round to be defensive about id drift
  const targets = await db.race.findMany({
    where: {
      AND: [
        { status: 'LIVE' },
        {
          OR: [
            { name: 'Saudi Arabian Grand Prix', type: 'MAIN' },
            { name: 'Bahrain Sprint', type: 'SPRINT' },
            { name: 'Bahrain Grand Prix', type: 'MAIN' },
          ],
        },
      ],
    },
    select: { id: true, name: true, type: true, status: true, scheduledStartUtc: true },
  })

  if (targets.length === 0) {
    console.log('No matching LIVE races found — already restored or never flipped.')
    return
  }

  console.log(`Found ${targets.length} race(s) to restore to CANCELLED:`)
  for (const r of targets) {
    console.log(`  ${r.id}  ${r.name} (${r.type})  current=${r.status}  start=${r.scheduledStartUtc.toISOString()}`)
  }

  const result = await db.race.updateMany({
    where: { id: { in: targets.map((r) => r.id) } },
    data: { status: 'CANCELLED' },
  })

  console.log(`Updated ${result.count} race(s) → CANCELLED`)

  // Verify
  const verify = await db.race.findMany({
    where: { id: { in: targets.map((r) => r.id) } },
    select: { id: true, name: true, status: true },
  })
  console.log('Post-update state:')
  for (const r of verify) console.log(`  ${r.id}  ${r.name}  status=${r.status}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
