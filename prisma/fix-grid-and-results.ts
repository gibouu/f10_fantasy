/**
 * Comprehensive 2026 grid + race results fix.
 *
 * What this fixes:
 *  1. VER/NOR openf1DriverNumber were swapped (seed bug) → corrected
 *  2. HAD moved from Racing Bulls → Red Bull Racing
 *  3. LAW moved from Red Bull Racing → Racing Bulls
 *  4. TSU (#22) not in 2026 grid → openf1DriverNumber nulled
 *  5. Adds Cadillac constructor + PER (#11) + BOT (#77)
 *  6. Adds LIN (#41) to Racing Bulls
 *  7. Updates Race.openf1SessionKey to real OpenF1 values
 *  8. Fetches & stores real race results from OpenF1 API for all completed races
 *
 * Run with: npm run db:fix-grid
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const OPENF1 = 'https://api.openf1.org/v1'

// ─── Real 2026 session keys ─────────────────────────────────────────────────
const SESSION_KEYS: Record<string, number> = {
  'Australian Grand Prix': 11234,
  'Chinese Sprint':        11240,
  'Chinese Grand Prix':    11245,
  'Japanese Grand Prix':   11253,
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T[]> {
  const res = await fetch(`${OPENF1}${path}`)
  if (!res.ok) throw new Error(`OpenF1 ${res.status}: ${path}`)
  return res.json()
}

// ─── Get final classification using position + race_control data ─────────────

interface OpenF1Position { driver_number: number; position: number; date: string }
interface OpenF1RaceControl { driver_number: number | null; message: string; category: string }

async function getFinalResults(sessionKey: number) {
  const [positions, rcMsgs] = await Promise.all([
    fetchJson<OpenF1Position>(`/position?session_key=${sessionKey}`),
    fetchJson<OpenF1RaceControl>(`/race_control?session_key=${sessionKey}`).catch(() => [] as OpenF1RaceControl[]),
  ])

  // Latest position per driver
  const latest = new Map<number, OpenF1Position>()
  for (const p of positions) {
    const cur = latest.get(p.driver_number)
    if (!cur || p.date > cur.date) latest.set(p.driver_number, p)
  }

  // DNF driver numbers from race control messages
  const dnfNumbers = new Set<number>()
  for (const msg of rcMsgs) {
    if (!msg.driver_number) continue
    const text = (msg.message ?? '').toUpperCase()
    if (text.includes('RETIRED') || text.includes('DNF') || text.includes('MECHANICAL') || text.includes('ACCIDENT')) {
      // Only mark as DNF if specifically about retirement (not flags etc.)
      if (text.includes('RETIRED') || text.includes('DNF')) {
        dnfNumbers.add(msg.driver_number)
      }
    }
  }

  return Array.from(latest.values())
    .map(p => ({
      driverNumber: p.driver_number,
      position: dnfNumbers.has(p.driver_number) ? null : p.position,
      status: (dnfNumbers.has(p.driver_number) ? 'DNF' : 'CLASSIFIED') as 'DNF' | 'CLASSIFIED',
    }))
    .sort((a, b) => {
      if (a.position !== null && b.position !== null) return a.position - b.position
      if (a.position !== null) return -1
      return 1
    })
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Fix openf1DriverNumber for VER and NOR ────────────────────────────
  console.log('\n1️⃣  Fixing VER/NOR openf1DriverNumber...')
  await db.$executeRaw`UPDATE "Driver" SET "openf1DriverNumber" = 3  WHERE code = 'VER'`
  await db.$executeRaw`UPDATE "Driver" SET "openf1DriverNumber" = 1  WHERE code = 'NOR'`
  await db.$executeRaw`UPDATE "Driver" SET "openf1DriverNumber" = NULL WHERE code = 'TSU'`
  console.log('   ✅ VER → #3, NOR → #1, TSU → NULL')

  // ── 2. Swap HAD and LAW constructors ─────────────────────────────────────
  console.log('\n2️⃣  Swapping HAD/LAW constructor (Red Bull ↔ Racing Bulls)...')
  // Get constructor IDs
  const constructors = await db.$queryRaw<Array<{id: string; name: string}>>`
    SELECT id, name FROM "Constructor" WHERE name IN ('Red Bull Racing', 'Visa CashApp RB')
  `
  const redBullId = (constructors as any[]).find(c => c.name === 'Red Bull Racing')?.id
  const rbId = (constructors as any[]).find(c => c.name === 'Visa CashApp RB')?.id

  if (redBullId && rbId) {
    await db.$executeRaw`UPDATE "Driver" SET "constructorId" = ${redBullId} WHERE code = 'HAD'`
    await db.$executeRaw`UPDATE "Driver" SET "constructorId" = ${rbId} WHERE code = 'LAW'`
    console.log('   ✅ HAD → Red Bull Racing, LAW → Racing Bulls')
  } else {
    console.warn('   ⚠️  Could not find Red Bull or RB constructor')
  }

  // ── 3. Add Cadillac constructor if missing ───────────────────────────────
  console.log('\n3️⃣  Ensuring Cadillac constructor exists...')
  const cadillac = await db.$queryRaw<Array<{id: string}>>`
    SELECT id FROM "Constructor" WHERE name = 'Cadillac F1 Team'
  `
  let cadillacId: string
  if ((cadillac as any[]).length === 0) {
    const result = await db.$queryRaw<Array<{id: string}>>`
      INSERT INTO "Constructor" (id, name, "shortName", color, "openf1TeamName")
      VALUES (gen_random_uuid()::text, 'Cadillac F1 Team', 'Cadillac', '#FFFFFF', 'Cadillac')
      RETURNING id
    `
    cadillacId = (result as any[])[0].id
    console.log('   ✅ Created Cadillac constructor')
  } else {
    cadillacId = (cadillac as any[])[0].id
    console.log('   ✅ Cadillac constructor already exists')
  }

  // ── 4. Get Racing Bulls constructor ID for LIN ───────────────────────────
  const rbResult = await db.$queryRaw<Array<{id: string}>>`
    SELECT id FROM "Constructor" WHERE name = 'Visa CashApp RB'
  `
  const racingBullsId = (rbResult as any[])[0]?.id ?? rbId

  // ── 5. Add missing drivers (PER, LIN, BOT) ───────────────────────────────
  console.log('\n4️⃣  Adding missing 2026 drivers...')
  const newDrivers = [
    { code: 'PER', firstName: 'Sergio',  lastName: 'Perez',    number: 11, openf1Num: 11, constructorId: cadillacId },
    { code: 'LIN', firstName: 'Arvid',   lastName: 'Lindblad', number: 41, openf1Num: 41, constructorId: racingBullsId },
    { code: 'BOT', firstName: 'Valtteri',lastName: 'Bottas',   number: 77, openf1Num: 77, constructorId: cadillacId },
  ]

  for (const d of newDrivers) {
    if (!d.constructorId) { console.warn(`   ⚠️  No constructor for ${d.code}`); continue }
    const existing = await db.$queryRaw<Array<{id: string}>>`SELECT id FROM "Driver" WHERE code = ${d.code}`
    if ((existing as any[]).length > 0) {
      // Update openf1DriverNumber just in case
      await db.$executeRaw`UPDATE "Driver" SET "openf1DriverNumber" = ${d.openf1Num} WHERE code = ${d.code}`
      console.log(`   ℹ️  ${d.code} already exists, updated number`)
    } else {
      await db.$executeRaw`
        INSERT INTO "Driver" (id, code, "firstName", "lastName", number, "constructorId", "openf1DriverNumber")
        VALUES (gen_random_uuid()::text, ${d.code}, ${d.firstName}, ${d.lastName}, ${d.number}, ${d.constructorId}, ${d.openf1Num})
      `
      console.log(`   ✅ Added ${d.code} (#${d.number})`)
    }
  }

  // ── 6. Refresh driver map ────────────────────────────────────────────────
  const allDrivers = await db.$queryRaw<Array<{id: string; code: string; 'openf1DriverNumber': number | null}>>`
    SELECT id, code, "openf1DriverNumber" FROM "Driver"
  `
  const byCode    = new Map((allDrivers as any[]).map((d: any) => [d.code, d.id]))
  const byOpenF1  = new Map((allDrivers as any[]).filter((d: any) => d.openf1DriverNumber).map((d: any) => [d.openf1DriverNumber, d.id]))

  // ── 7. Update Race openf1SessionKey values ───────────────────────────────
  console.log('\n5️⃣  Updating Race openf1SessionKey to real values...')
  for (const [raceName, sessionKey] of Object.entries(SESSION_KEYS)) {
    await db.$executeRaw`UPDATE "Race" SET "openf1SessionKey" = ${sessionKey} WHERE name = ${raceName}`
    console.log(`   ✅ ${raceName} → session ${sessionKey}`)
  }

  // ── 8. For each race: add race entries for new drivers, seed real results ─
  console.log('\n6️⃣  Fetching real race results from OpenF1...')

  const races = await db.$queryRaw<Array<{id: string; name: string; type: string}>>`
    SELECT id, name, type FROM "Race" WHERE name IN ('Australian Grand Prix','Chinese Sprint','Chinese Grand Prix','Japanese Grand Prix')
  `

  for (const race of races as any[]) {
    const sessionKey = SESSION_KEYS[race.name]
    if (!sessionKey) { console.warn(`   ⚠️  No session key for ${race.name}`); continue }

    console.log(`\n   📊 ${race.name} (session ${sessionKey})`)

    // Ensure race entries exist for all 22 drivers
    for (const [code, driverId] of byCode.entries()) {
      const exists = await db.$queryRaw<Array<{id: string}>>`
        SELECT id FROM "RaceEntry" WHERE "raceId" = ${race.id} AND "driverId" = ${driverId}
      `
      if ((exists as any[]).length === 0) {
        await db.$executeRaw`
          INSERT INTO "RaceEntry" (id, "raceId", "driverId", "isEligibleDnf")
          VALUES (gen_random_uuid()::text, ${race.id}, ${driverId}, true)
          ON CONFLICT DO NOTHING
        `
      }
    }

    // Fetch real results
    let results
    try {
      results = await getFinalResults(sessionKey)
    } catch (e) {
      console.warn(`   ⚠️  Could not fetch results: ${e}`)
      continue
    }

    console.log(`   Got ${results.length} drivers from OpenF1`)

    // Delete existing results
    await db.$executeRaw`DELETE FROM "RaceResult" WHERE "raceId" = ${race.id}`

    // Insert real results
    let inserted = 0
    for (const r of results) {
      const driverId = byOpenF1.get(r.driverNumber)
      if (!driverId) {
        console.warn(`   ⚠️  No DB driver for OpenF1 #${r.driverNumber}`)
        continue
      }
      await db.$executeRaw`
        INSERT INTO "RaceResult" (id, "raceId", "driverId", position, status, "fastestLap", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${race.id}, ${driverId}, ${r.position}, ${r.status}::"ResultStatus", false, now(), now())
      `
      inserted++
    }
    console.log(`   ✅ Inserted ${inserted} result rows`)

    // Print result summary
    for (const r of results) {
      const driver = (allDrivers as any[]).find((d: any) => d.openf1DriverNumber === r.driverNumber)
      const label = r.status === 'CLASSIFIED' ? `P${r.position}` : r.status
      console.log(`      ${label.padEnd(5)} ${driver?.code ?? '#' + r.driverNumber}`)
    }
  }

  console.log('\n🎉  Done!')
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
