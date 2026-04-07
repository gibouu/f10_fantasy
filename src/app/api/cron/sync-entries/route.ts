/**
 * Cron: lightweight refresh of RaceEntry rows for upcoming races.
 *
 * Unlike sync-schedule (which fetches all sessions and meetings for the year),
 * this route only touches races that are not yet completed — using the
 * openf1SessionKey already stored in the Race record to fetch current drivers.
 *
 * Safe to run hourly. Handles mid-season driver swaps and substitutes.
 * Completed races are never touched — their grids are final.
 *
 * Protected by the CRON_SECRET environment variable.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { createF1Provider } from '@/lib/f1/adapter'

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return provided === secret
}

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = createF1Provider()

  // Only process races that are not yet completed and have a known OpenF1 session key.
  // LIVE races are included so the entry list stays accurate right up to race start.
  const upcomingRaces = await db.race.findMany({
    where: {
      status: { not: 'COMPLETED' },
      openf1SessionKey: { not: null },
    },
    select: {
      id: true,
      name: true,
      openf1SessionKey: true,
    },
  })

  if (upcomingRaces.length === 0) {
    return NextResponse.json({ refreshed: 0, message: 'No upcoming races to refresh' })
  }

  // Fetch current driver lists from OpenF1 for each upcoming session in parallel.
  const sessionResults = await Promise.all(
    upcomingRaces.map(async (race) => {
      try {
        const drivers = await provider.getDriversForSession(race.openf1SessionKey!)
        return { race, drivers }
      } catch {
        console.warn(`[sync-entries] Failed to fetch drivers for race ${race.name} (session ${race.openf1SessionKey})`)
        return { race, drivers: [] }
      }
    }),
  )

  // Collect all unique constructors and drivers across fetched sessions.
  const uniqueConstructors = new Map<string, { teamName: string; color: string }>()
  const uniqueDrivers = new Map<number, { driverNumber: number; code: string; firstName: string; lastName: string; photoUrl: string | null; teamName: string; constructorId?: string }>()

  for (const { drivers } of sessionResults) {
    for (const d of drivers) {
      if (!uniqueConstructors.has(d.teamName)) {
        uniqueConstructors.set(d.teamName, {
          teamName: d.teamName,
          color: d.teamColor.startsWith('#') ? d.teamColor : `#${d.teamColor}`,
        })
      }
      // Last session wins for driver metadata
      uniqueDrivers.set(d.driverNumber, {
        driverNumber: d.driverNumber,
        code: d.code,
        firstName: d.firstName,
        lastName: d.lastName,
        photoUrl: d.photoUrl,
        teamName: d.teamName,
      })
    }
  }

  // Upsert constructors (handles new constructors from substitutes).
  if (uniqueConstructors.size > 0) {
    await db.$transaction(
      Array.from(uniqueConstructors.values()).map((c) =>
        db.constructor.upsert({
          where: { openf1TeamName: c.teamName },
          create: {
            name: c.teamName,
            shortName: c.teamName.split(' ').pop() ?? c.teamName,
            color: c.color,
            openf1TeamName: c.teamName,
          },
          update: { color: c.color },
        }),
      ),
    )
  }

  const constructorIdByTeam = new Map(
    (
      await db.$queryRaw<Array<{ id: string; openf1TeamName: string }>>`
        SELECT id, "openf1TeamName" FROM "Constructor"
      `
    ).map((c) => [c.openf1TeamName, c.id]),
  )

  // Upsert drivers (handles substitutes who may not be in the DB yet).
  if (uniqueDrivers.size > 0) {
    await db.$transaction(
      Array.from(uniqueDrivers.values())
        .filter((d) => constructorIdByTeam.has(d.teamName))
        .map((d) => {
          const constructorId = constructorIdByTeam.get(d.teamName)!
          return db.driver.upsert({
            where: { openf1DriverNumber: d.driverNumber },
            create: {
              code: d.code,
              firstName: d.firstName,
              lastName: d.lastName,
              number: d.driverNumber,
              photoUrl: d.photoUrl,
              constructorId,
              openf1DriverNumber: d.driverNumber,
            },
            update: {
              code: d.code,
              firstName: d.firstName,
              lastName: d.lastName,
              photoUrl: d.photoUrl,
              constructorId,
            },
          })
        }),
    )
  }

  const driverIdByNumber = new Map(
    (
      await db.$queryRaw<Array<{ id: string; openf1DriverNumber: number }>>`
        SELECT id, "openf1DriverNumber" FROM "Driver"
      `
    ).map((d) => [d.openf1DriverNumber, d.id]),
  )

  // Rebuild RaceEntry rows for each refreshed race.
  let refreshed = 0

  for (const { race, drivers } of sessionResults) {
    if (drivers.length === 0) continue

    const entries = drivers
      .map((d) => ({ raceId: race.id, driverId: driverIdByNumber.get(d.driverNumber) }))
      .filter((e): e is { raceId: string; driverId: string } => e.driverId !== undefined)

    if (entries.length === 0) continue

    await db.$transaction([
      db.raceEntry.deleteMany({ where: { raceId: race.id } }),
      db.raceEntry.createMany({ data: entries, skipDuplicates: true }),
    ])

    refreshed++
  }

  return NextResponse.json({ refreshed, total: upcomingRaces.length })
}
