/**
 * GET /api/diag/health
 *
 * Race-weekend overview. Returns one JSON blob with:
 *   - server time
 *   - the next 3 upcoming races (with timing relative to now)
 *   - the most recent 3 races (with results + score coverage)
 *   - any pipeline-level issues across that window
 *
 * Designed to be curl-able from a phone — when something feels wrong on
 * Saturday, hit this first to get a one-screen snapshot. For deeper detail
 * on a specific race, follow up with /api/diag/race/<id>.
 *
 * Protected by CRON_SECRET. Bearer header required.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db/client"

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = req.headers.get("authorization")
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  return provided === secret
}

type RaceSnapshot = {
  raceId: string
  name: string
  type: string
  status: string
  scheduledStartUtc: string
  lockCutoffUtc: string
  secondsUntilStart: number
  entries: number
  results: number
  picks: number
  scored: number
  issues: string[]
}

async function snapshot(raceId: string, now: Date): Promise<RaceSnapshot | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      scheduledStartUtc: true,
      lockCutoffUtc: true,
      openf1SessionKey: true,
    },
  })
  if (!race) return null

  const [entryCount, resultCount, pickCount, scoreCount] = await Promise.all([
    db.raceEntry.count({ where: { raceId } }),
    db.raceResult.count({ where: { raceId } }),
    db.pickSet.count({ where: { raceId } }),
    db.scoreBreakdown.count({ where: { pickSet: { raceId } } }),
  ])

  const issues: string[] = []
  if (!race.openf1SessionKey) issues.push("no openf1SessionKey")
  if (entryCount === 0) issues.push("no RaceEntry rows")
  if (race.status === "COMPLETED" && resultCount === 0) {
    issues.push("COMPLETED but no results")
  }
  if (
    race.status === "COMPLETED" &&
    resultCount > 0 &&
    pickCount > 0 &&
    scoreCount === 0
  ) {
    issues.push("results stored but no scores")
  }
  if (resultCount > 0 && pickCount > 0 && scoreCount < pickCount) {
    issues.push(`partial scoring ${scoreCount}/${pickCount}`)
  }
  if (
    race.status !== "COMPLETED" &&
    race.scheduledStartUtc <= now &&
    race.status !== "LIVE"
  ) {
    issues.push(`scheduled start past but status=${race.status}`)
  }

  return {
    raceId: race.id,
    name: race.name,
    type: race.type,
    status: race.status,
    scheduledStartUtc: race.scheduledStartUtc.toISOString(),
    lockCutoffUtc: race.lockCutoffUtc.toISOString(),
    secondsUntilStart: Math.round(
      (race.scheduledStartUtc.getTime() - now.getTime()) / 1000,
    ),
    entries: entryCount,
    results: resultCount,
    picks: pickCount,
    scored: scoreCount,
    issues,
  }
}

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  const upcoming = await db.race.findMany({
    where: { status: { in: ["UPCOMING", "LIVE"] } },
    orderBy: { scheduledStartUtc: "asc" },
    take: 3,
    select: { id: true },
  })

  const recent = await db.race.findMany({
    where: { status: "COMPLETED" },
    orderBy: { scheduledStartUtc: "desc" },
    take: 3,
    select: { id: true },
  })

  const [upcomingSnapshots, recentSnapshots] = await Promise.all([
    Promise.all(upcoming.map((r) => snapshot(r.id, now))),
    Promise.all(recent.map((r) => snapshot(r.id, now))),
  ])

  const allIssues = [
    ...upcomingSnapshots.filter((s): s is RaceSnapshot => s !== null),
    ...recentSnapshots.filter((s): s is RaceSnapshot => s !== null),
  ]
    .filter((s) => s.issues.length > 0)
    .map((s) => ({ raceId: s.raceId, name: s.name, issues: s.issues }))

  return NextResponse.json({
    serverTime: now.toISOString(),
    upcoming: upcomingSnapshots.filter((s): s is RaceSnapshot => s !== null),
    recent: recentSnapshots.filter((s): s is RaceSnapshot => s !== null),
    issues: allIssues,
    healthy: allIssues.length === 0,
  })
}
