/**
 * Cron: sync race schedule from OpenF1.
 *
 * Protected by the CRON_SECRET environment variable.
 * The middleware also validates this header before requests reach this handler,
 * but we double-check here for defence in depth.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db/client"
import { createF1Provider } from "@/lib/f1/adapter"

// ─── Auth helper ──────────────────────────────────────────────────────────────

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get("authorization")
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null
  return provided === secret
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/sync-schedule
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const year = new Date().getFullYear()
  const provider = createF1Provider()

  // ── 1. Ensure there is an active Season record for the current year ────────
  let season = await db.season.findFirst({
    where: { year },
    select: { id: true, year: true },
  })

  if (!season) {
    await db.season.updateMany({ where: { isActive: true }, data: { isActive: false } })
    season = await db.season.create({
      data: { year, isActive: true },
      select: { id: true, year: true },
    })
  }

  // ── 2. Fetch sessions + meetings in parallel ───────────────────────────────
  const [sessions, meetings] = await Promise.all([
    provider.getSessions(year),
    provider.getMeetings(year),
  ])

  const relevantSessions = sessions.filter(
    (s) => s.type === "Race" || s.type === "Sprint",
  )
  const meetingMap = new Map(meetings.map((m) => [m.meetingKey, m]))
  const sortedMeetings = [...meetings].sort((a, b) => a.meetingKey - b.meetingKey)

  // ── 3. Determine which sessions already have driver data in the DB ─────────
  // Completed races with existing entries don't need driver re-syncing — their
  // grid is locked and the data won't change.
  const completedWithEntries = await db.race.findMany({
    where: {
      status: "COMPLETED",
      entries: { some: {} },
      openf1SessionKey: { not: null },
    },
    select: { openf1SessionKey: true },
  })
  const skipDriverKeys = new Set(
    completedWithEntries
      .map((r) => r.openf1SessionKey)
      .filter((k): k is number => k !== null),
  )

  // ── 4. Build the set of sessions to fetch drivers for ─────────────────────
  // - Active/upcoming Race+Sprint sessions (grid may still change)
  // - Qualifying sessions from the same meetings (captures all 22 registered
  //   drivers, including any that DNS the race)
  const activeMeetingKeys = new Set(
    relevantSessions
      .filter((s) => !skipDriverKeys.has(s.sessionKey))
      .map((s) => s.meetingKey),
  )
  const qualifyingSessions = sessions.filter(
    (s) => s.type === "Qualifying" && activeMeetingKeys.has(s.meetingKey),
  )
  const driverFetchSessions = [
    ...relevantSessions.filter((s) => !skipDriverKeys.has(s.sessionKey)),
    ...qualifyingSessions,
  ]

  // ── 5. Fetch drivers for all relevant sessions in parallel ─────────────────
  type DriverList = Awaited<ReturnType<typeof provider.getDriversForSession>>
  const sessionDrivers = await Promise.all(
    driverFetchSessions.map(async (session) => {
      try {
        const drivers = await provider.getDriversForSession(session.sessionKey)
        return { session, drivers }
      } catch {
        return { session, drivers: [] as DriverList }
      }
    }),
  )

  // ── 6. Upsert Race records (Race + Sprint sessions only) ───────────────────
  const raceIdBySessionKey = new Map<number, string>()
  let synced = 0

  for (const session of relevantSessions) {
    const meeting = meetingMap.get(session.meetingKey)
    if (!meeting) continue

    const round =
      sortedMeetings.findIndex((m) => m.meetingKey === meeting.meetingKey) + 1
    const raceType = session.type === "Sprint" ? "SPRINT" : "MAIN"
    const lockCutoffUtc = new Date(
      session.scheduledStartUtc.getTime() - 30 * 60 * 1000,
    )

    const raceData = {
      seasonId: season.id,
      round,
      name: meeting.name,
      circuitName: meeting.circuitName,
      country: meeting.country,
      type: raceType as "MAIN" | "SPRINT",
      scheduledStartUtc: session.scheduledStartUtc,
      lockCutoffUtc,
      openf1MeetingKey: session.meetingKey,
      status:
        session.status === "finished"
          ? ("COMPLETED" as const)
          : session.status === "active"
            ? ("LIVE" as const)
            : ("UPCOMING" as const),
    }

    const race = await db.race.upsert({
      where: { openf1SessionKey: session.sessionKey },
      create: { ...raceData, openf1SessionKey: session.sessionKey },
      update: raceData,
      select: { id: true },
    })
    raceIdBySessionKey.set(session.sessionKey, race.id)
    synced++
  }

  // Skip the remaining steps if no driver data was fetched
  if (sessionDrivers.every((sd) => sd.drivers.length === 0)) {
    return NextResponse.json({ synced, year, driversSkipped: true })
  }

  // ── 7. Batch upsert Constructors ───────────────────────────────────────────
  const uniqueConstructors = new Map<string, { teamName: string; color: string }>()
  for (const { drivers } of sessionDrivers) {
    for (const driver of drivers) {
      uniqueConstructors.set(driver.teamName, {
        teamName: driver.teamName,
        color: driver.teamColor.startsWith("#")
          ? driver.teamColor
          : `#${driver.teamColor}`,
      })
    }
  }

  await db.$transaction(
    Array.from(uniqueConstructors.values()).map((c) =>
      db.constructor.upsert({
        where: { openf1TeamName: c.teamName },
        create: {
          name: c.teamName,
          shortName: c.teamName.split(" ").pop() ?? c.teamName,
          color: c.color,
          openf1TeamName: c.teamName,
        },
        update: { color: c.color },
      }),
    ),
  )

  const constructorIdByTeam = new Map(
    (
      await db.$queryRaw<Array<{ id: string; openf1TeamName: string }>>`
        SELECT id, "openf1TeamName" FROM "Constructor"
      `
    ).map((c) => [c.openf1TeamName, c.id]),
  )

  // ── 8. Batch upsert Drivers ────────────────────────────────────────────────
  // Deduplicate by driver number across all fetched sessions (qualifying +
  // race/sprint) — last session wins for mutable fields.
  const uniqueDrivers = new Map<
    number,
    DriverList[number] & { constructorId: string }
  >()
  for (const { drivers } of sessionDrivers) {
    for (const driver of drivers) {
      const constructorId = constructorIdByTeam.get(driver.teamName)
      if (!constructorId) continue
      uniqueDrivers.set(driver.driverNumber, { ...driver, constructorId })
    }
  }

  await db.$transaction(
    Array.from(uniqueDrivers.values()).map((d) =>
      db.driver.upsert({
        where: { openf1DriverNumber: d.driverNumber },
        create: {
          code: d.code,
          firstName: d.firstName,
          lastName: d.lastName,
          number: d.driverNumber,
          photoUrl: d.photoUrl,
          constructorId: d.constructorId,
          openf1DriverNumber: d.driverNumber,
        },
        update: {
          code: d.code,
          firstName: d.firstName,
          lastName: d.lastName,
          photoUrl: d.photoUrl,
          constructorId: d.constructorId,
        },
      }),
    ),
  )

  const driverIdByNumber = new Map(
    (
      await db.$queryRaw<Array<{ id: string; openf1DriverNumber: number }>>`
        SELECT id, "openf1DriverNumber" FROM "Driver"
      `
    ).map((d) => [d.openf1DriverNumber, d.id]),
  )

  // ── 9. Batch create RaceEntries (Race + Sprint sessions only) ──────────────
  // Qualifying sessions are used only for driver/constructor population above.
  const raceSessions = new Set(
    relevantSessions
      .filter((s) => !skipDriverKeys.has(s.sessionKey))
      .map((s) => s.sessionKey),
  )
  const raceEntries: { raceId: string; driverId: string }[] = []

  for (const { session, drivers } of sessionDrivers) {
    if (!raceSessions.has(session.sessionKey)) continue
    const raceId = raceIdBySessionKey.get(session.sessionKey)
    if (!raceId) continue
    for (const driver of drivers) {
      const driverId = driverIdByNumber.get(driver.driverNumber)
      if (!driverId) continue
      raceEntries.push({ raceId, driverId })
    }
  }

  const refreshedRaceIds = Array.from(new Set(raceEntries.map((entry) => entry.raceId)))

  await db.$transaction([
    db.raceEntry.deleteMany({
      where: { raceId: { in: refreshedRaceIds } },
    }),
    db.raceEntry.createMany({ data: raceEntries, skipDuplicates: true }),
  ])

  return NextResponse.json({ synced, year })
}
