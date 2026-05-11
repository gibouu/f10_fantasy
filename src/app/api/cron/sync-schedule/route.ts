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
  // OpenF1 restricts the public API during live sessions (returns 401 with a
  // "Live F1 session in progress" message). Treat any provider error as a soft
  // skip so AWS scheduler doesn't retry-storm the route — the next scheduled
  // tick will pick up where we left off.
  let sessions: Awaited<ReturnType<typeof provider.getSessions>>
  let meetings: Awaited<ReturnType<typeof provider.getMeetings>>
  try {
    ;[sessions, meetings] = await Promise.all([
      provider.getSessions(year),
      provider.getMeetings(year),
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[f10:cron:sync-schedule] provider unavailable: ${message}`)
    return NextResponse.json({
      synced: 0,
      year,
      skipped: true,
      reason: message,
    })
  }

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
  // For each Race row we also pair the qualifying session that precedes it
  // (latest Qualifying in the same meeting whose start < race start). This
  // works for both sprint and non-sprint weekends:
  //   - Non-sprint: the only Qualifying pairs with the Main race.
  //   - Sprint: Sprint Shootout (Friday) pairs with the Sprint race; main
  //     Qualifying (Saturday) pairs with the Sunday Main race.
  const allQualifyingSessions = sessions.filter((s) => s.type === "Qualifying")

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

    const qualifyingSessionKey =
      allQualifyingSessions
        .filter(
          (q) =>
            q.meetingKey === session.meetingKey &&
            q.scheduledStartUtc.getTime() < session.scheduledStartUtc.getTime(),
        )
        .sort(
          (a, b) =>
            b.scheduledStartUtc.getTime() - a.scheduledStartUtc.getTime(),
        )[0]?.sessionKey ?? null

    // Status is owned by lock-picks (UPCOMING → LIVE) and ingest-results
    // (LIVE → COMPLETED, after results are actually written). sync-schedule
    // sets the initial status only on insert. On update it is intentionally
    // omitted so we don't race with the other crons or create a COMPLETED-
    // without-results window when OpenF1's session.status flips to "finished"
    // before final results are published.
    const initialStatus =
      session.status === "finished"
        ? ("LIVE" as const) // ingest-results will flip to COMPLETED once data is in
        : session.status === "active"
          ? ("LIVE" as const)
          : ("UPCOMING" as const)

    // Round is computed from the position of this meeting in sortedMeetings.
    // That's not stable across re-syncs (e.g. cancelled races, OpenF1 data
    // shifts), and writing a changed round on update can collide with
    // [seasonId, round, type] when another race already occupies the new
    // slot. We set round only on insert. Existing rows keep whatever round
    // was assigned when first synced — manual fix-ups can adjust if needed.

    // OpenF1 ships a single meeting_name per weekend (e.g. "Miami Grand Prix")
    // shared by both the Sprint and the Race sessions. We derive the sprint
    // row's display name by swapping the "Grand Prix" suffix for "Sprint" so
    // the races list shows e.g. "Miami Sprint" and "Miami Grand Prix" as
    // distinct entries instead of two identical names disambiguated only by
    // the SPRINT badge.
    const displayName =
      raceType === "SPRINT"
        ? meeting.name.endsWith(" Grand Prix")
          ? `${meeting.name.slice(0, -" Grand Prix".length)} Sprint`
          : `${meeting.name} Sprint`
        : meeting.name

    const updatePayload = {
      // intentionally NO `round` here — see comment above
      // intentionally NO `status` here — owned by lock-picks + ingest-results
      seasonId: season.id,
      name: displayName,
      circuitName: meeting.circuitName,
      country: meeting.country,
      type: raceType as "MAIN" | "SPRINT",
      scheduledStartUtc: session.scheduledStartUtc,
      lockCutoffUtc,
      openf1MeetingKey: session.meetingKey,
      openf1QualifyingSessionKey: qualifyingSessionKey,
    }

    const createPayload = {
      ...updatePayload,
      round,
      openf1SessionKey: session.sessionKey,
      status: initialStatus,
    }

    // OpenF1 occasionally re-issues session AND meeting keys mid-season
    // (republishes), and occasionally adjusts scheduled start times. We try
    // a chain of progressively looser identifiers to pick the existing DB
    // row before falling back to insert:
    //   1. [seasonId, openf1MeetingKey, type] — exact meeting match
    //   2. [seasonId, type, scheduledStartUtc within ±36h] — same weekend
    //      slot even if both meeting key and exact time drifted
    //   3. insert new
    try {
      let existing = await db.race.findFirst({
        where: {
          seasonId: season.id,
          openf1MeetingKey: session.meetingKey,
          type: raceType as "MAIN" | "SPRINT",
        },
        select: { id: true },
      })

      if (!existing) {
        const start = session.scheduledStartUtc.getTime()
        const windowMs = 36 * 60 * 60 * 1000
        existing = await db.race.findFirst({
          where: {
            seasonId: season.id,
            type: raceType as "MAIN" | "SPRINT",
            scheduledStartUtc: {
              gte: new Date(start - windowMs),
              lte: new Date(start + windowMs),
            },
          },
          select: { id: true },
        })
      }

      let raceId: string
      if (existing) {
        await db.race.update({
          where: { id: existing.id },
          data: { ...updatePayload, openf1SessionKey: session.sessionKey },
        })
        raceId = existing.id
      } else {
        const created = await db.race.create({
          data: createPayload,
          select: { id: true },
        })
        raceId = created.id
      }
      raceIdBySessionKey.set(session.sessionKey, raceId)
      synced++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[f10:cron:sync-schedule] upsert FAIL sessionKey=${session.sessionKey} (${meeting.name} ${raceType}): ${message}`,
      )
      // Continue — don't let one bad row kill the whole sync.
    }
  }

  // ── 6.5. Reconcile orphan races ────────────────────────────────────────────
  // Sync-schedule is otherwise additive (upserts only). If OpenF1 drops a race
  // mid-season — e.g. a provisional weekend that gets cancelled, or one that
  // never existed at all and was synced from stale upstream data — the row
  // sits forever in DB as UPCOMING. This step cancels any UPCOMING + future
  // row in the active season that wasn't matched by the upsert loop above.
  //
  // Status ownership note: the 2026-05-02 21:00 worklog records that
  // sync-schedule does not write status on update, leaving UPCOMING→LIVE
  // (lock-picks) and LIVE→COMPLETED (ingest-results) to the dedicated crons.
  // This step adds a third explicit transition — UPCOMING→CANCELLED for
  // orphan-from-upstream cases — but it is gated to rows that this run did
  // NOT touch and only ever moves to CANCELLED, never to any other state.
  //
  // Safety guards:
  //   - Refuse if OpenF1 returned fewer than 10 meetings (probable upstream
  //     outage / partial response).
  //   - Only touch UPCOMING rows whose scheduledStartUtc is still in the
  //     future — prevents accidentally cancelling a race that just transitioned
  //     to LIVE between the upsert loop and this step.
  //   - Never touch COMPLETED, LIVE, or already-CANCELLED rows.
  //   - Never resurrect a CANCELLED row (we don't upsert here at all).
  let reconciled = 0
  const MIN_MEETINGS_FOR_RECONCILE = 10
  if (meetings.length >= MIN_MEETINGS_FOR_RECONCILE) {
    const touchedIds = new Set(raceIdBySessionKey.values())
    const orphanCandidates = await db.race.findMany({
      where: {
        seasonId: season.id,
        status: "UPCOMING",
        scheduledStartUtc: { gt: new Date() },
      },
      select: { id: true, name: true, type: true, round: true },
    })
    const orphans = orphanCandidates.filter((r) => !touchedIds.has(r.id))
    if (orphans.length > 0) {
      const result = await db.race.updateMany({
        where: { id: { in: orphans.map((o) => o.id) } },
        data: { status: "CANCELLED" },
      })
      reconciled = result.count
      for (const o of orphans) {
        console.log(
          `[f10:cron:sync-schedule] reconcile CANCELLED R${o.round} ${o.type} "${o.name}" (id=${o.id}) — no longer in OpenF1`,
        )
      }
    }
  } else {
    console.warn(
      `[f10:cron:sync-schedule] reconcile SKIPPED — OpenF1 returned only ${meetings.length} meetings (threshold ${MIN_MEETINGS_FOR_RECONCILE})`,
    )
  }

  // Skip the remaining steps if no driver data was fetched
  if (sessionDrivers.every((sd) => sd.drivers.length === 0)) {
    return NextResponse.json({ synced, reconciled, year, driversSkipped: true })
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

  return NextResponse.json({ synced, reconciled, year })
}
