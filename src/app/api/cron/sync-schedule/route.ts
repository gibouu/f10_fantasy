/**
 * Cron: sync race schedule from OpenF1.
 *
 * Add to vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/sync-schedule", "schedule": "0 0 * * *" }]
 * }
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
    // Create the season and mark it active; deactivate any previously active season first
    await db.season.updateMany({ where: { isActive: true }, data: { isActive: false } })
    season = await db.season.create({
      data: { year, isActive: true },
      select: { id: true, year: true },
    })
  }

  // ── 2. Fetch all sessions from OpenF1 for this year ───────────────────────
  const sessions = await provider.getSessions(year)

  // Only Race and Sprint sessions are fantasy-relevant
  const relevantSessions = sessions.filter(
    (s) => s.type === "Race" || s.type === "Sprint",
  )

  // ── 3. Upsert Race records ─────────────────────────────────────────────────
  // We also need meeting data to get circuit / country names
  const meetings = await provider.getMeetings(year)
  const meetingMap = new Map(meetings.map((m) => [m.meetingKey, m]))

  let synced = 0

  for (const session of relevantSessions) {
    const meeting = meetingMap.get(session.meetingKey)
    if (!meeting) continue

    // Derive round number from the meeting order.
    // OpenF1 meetings are returned in chronological order; we use meeting key
    // position as a proxy since there's no explicit "round" field.
    // A more robust approach would be to sort meetings by date and assign rounds.
    const sortedMeetings = [...meetings].sort((a, b) => a.meetingKey - b.meetingKey)
    const round = sortedMeetings.findIndex((m) => m.meetingKey === meeting.meetingKey) + 1

    const raceType = session.type === "Sprint" ? "SPRINT" : "MAIN"

    // Lock cutoff = 30 minutes before scheduled start
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
      // Status derived from OpenF1 session status
      status:
        session.status === "finished"
          ? ("COMPLETED" as const)
          : session.status === "active"
            ? ("LIVE" as const)
            : ("UPCOMING" as const),
    }

    // Upsert on openf1SessionKey as the stable unique key from the provider
    await db.race.upsert({
      where: { openf1SessionKey: session.sessionKey },
      create: { ...raceData, openf1SessionKey: session.sessionKey },
      update: raceData,
    })

    synced++

    // ── 4. Sync drivers + constructors + race entries for this session ───────
    let drivers: Awaited<ReturnType<typeof provider.getDriversForSession>>
    try {
      drivers = await provider.getDriversForSession(session.sessionKey)
    } catch {
      // Driver data may not be available for future sessions — skip gracefully
      continue
    }

    // Load the race record we just upserted so we have its DB id
    const race = await db.race.findUnique({
      where: { openf1SessionKey: session.sessionKey },
      select: { id: true },
    })
    if (!race) continue

    for (const driver of drivers) {
      // Upsert Constructor (keyed on openf1TeamName)
      const constructor = await db.constructor.upsert({
        where: { openf1TeamName: driver.teamName },
        create: {
          name: driver.teamName,
          shortName: driver.teamName.split(" ").pop() ?? driver.teamName,
          // OpenF1 returns color without # prefix; add it if missing
          color: driver.teamColor.startsWith("#") ? driver.teamColor : `#${driver.teamColor}`,
          openf1TeamName: driver.teamName,
        },
        update: {
          color: driver.teamColor.startsWith("#") ? driver.teamColor : `#${driver.teamColor}`,
        },
      })

      // Upsert Driver (keyed on openf1DriverNumber)
      const dbDriver = await db.driver.upsert({
        where: { openf1DriverNumber: driver.driverNumber },
        create: {
          code: driver.code,
          firstName: driver.firstName,
          lastName: driver.lastName,
          number: driver.driverNumber,
          photoUrl: driver.photoUrl,
          constructorId: constructor.id,
          openf1DriverNumber: driver.driverNumber,
        },
        update: {
          code: driver.code,
          firstName: driver.firstName,
          lastName: driver.lastName,
          photoUrl: driver.photoUrl,
          constructorId: constructor.id,
        },
      })

      // Upsert RaceEntry — idempotent join between race and driver
      await db.raceEntry.upsert({
        where: { raceId_driverId: { raceId: race.id, driverId: dbDriver.id } },
        create: { raceId: race.id, driverId: dbDriver.id },
        update: {},
      })
    }
  }

  return NextResponse.json({ synced, year })
}
