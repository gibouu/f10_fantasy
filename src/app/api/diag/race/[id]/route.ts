/**
 * GET /api/diag/race/[id]
 *
 * Single-shot pipeline diagnostic for a race. Returns one JSON blob containing
 * the race row, entrant count, result count, pick-set count, score-breakdown
 * count, and any obvious mismatches the cron pipeline can leave behind.
 *
 * Designed to be curl-able from a phone via iOS Shortcuts when watching a race
 * weekend, e.g.:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.fxracing.ca/api/diag/race/<id> | jq
 *
 * Protected by CRON_SECRET (same secret the cron Lambdas use). Not routed
 * through the middleware's public-API allowlist — every request must carry the
 * Bearer header.
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const raceId = params.id

  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      seasonId: true,
      round: true,
      name: true,
      type: true,
      status: true,
      country: true,
      circuitName: true,
      scheduledStartUtc: true,
      lockCutoffUtc: true,
      openf1SessionKey: true,
      openf1MeetingKey: true,
      openf1QualifyingSessionKey: true,
    },
  })

  if (!race) {
    return NextResponse.json({ error: "Race not found", raceId }, { status: 404 })
  }

  const [entryCount, resultRows, pickSetCount, scoreCount, latestScore, qualifyingCount] =
    await Promise.all([
      db.raceEntry.count({ where: { raceId } }),
      db.raceResult.findMany({
        where: { raceId },
        select: { status: true, position: true },
      }),
      db.pickSet.count({ where: { raceId } }),
      db.scoreBreakdown.count({
        where: { pickSet: { raceId } },
      }),
      db.scoreBreakdown.findFirst({
        where: { pickSet: { raceId } },
        orderBy: { computedAt: "desc" },
        select: { computedAt: true, totalScore: true },
      }),
      db.qualifyingResult.count({ where: { raceId } }),
    ])

  const resultStatusBreakdown = resultRows.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    {},
  )

  const now = new Date()
  const lockCutoffPassed = race.lockCutoffUtc <= now
  const startedScheduled = race.scheduledStartUtc <= now

  // Heuristic mismatch flags — surface anything obviously off so the user can
  // decide which cron to re-run from their phone.
  const issues: string[] = []
  if (!race.openf1SessionKey) {
    issues.push(
      "race has no openf1SessionKey — sync-schedule needs to have linked it",
    )
  }
  if (entryCount === 0) {
    issues.push(
      "no RaceEntry rows — sync-schedule / sync-entries did not populate the grid",
    )
  }
  if (race.status === "COMPLETED" && resultRows.length === 0) {
    issues.push(
      "race status is COMPLETED but no RaceResult rows — ingest-results has not run successfully",
    )
  }
  if (
    race.status === "COMPLETED" &&
    resultRows.length > 0 &&
    pickSetCount > 0 &&
    scoreCount === 0
  ) {
    issues.push(
      "results stored but no ScoreBreakdown rows — compute-scores has not run successfully",
    )
  }
  if (resultRows.length > 0 && pickSetCount > 0 && scoreCount < pickSetCount) {
    issues.push(
      `score coverage is partial: ${scoreCount}/${pickSetCount} pick sets scored — recompute may be needed`,
    )
  }
  if (
    race.status !== "COMPLETED" &&
    startedScheduled &&
    race.status !== "LIVE"
  ) {
    issues.push(
      `scheduled start is in the past but status is ${race.status} — lock-picks should have flipped it to LIVE`,
    )
  }
  if (
    race.status !== "COMPLETED" &&
    lockCutoffPassed &&
    pickSetCount > 0
  ) {
    const unlocked = await db.pickSet.count({
      where: { raceId, lockedAt: null },
    })
    if (unlocked > 0) {
      issues.push(
        `lockCutoff passed but ${unlocked} pick set(s) still have lockedAt=null — lock-picks should have closed them`,
      )
    }
  }

  return NextResponse.json({
    raceId,
    serverTime: now.toISOString(),
    race: {
      ...race,
      scheduledStartUtc: race.scheduledStartUtc.toISOString(),
      lockCutoffUtc: race.lockCutoffUtc.toISOString(),
    },
    timing: {
      lockCutoffPassed,
      startedScheduled,
      secondsUntilLock: Math.round(
        (race.lockCutoffUtc.getTime() - now.getTime()) / 1000,
      ),
      secondsSinceStart: Math.round(
        (now.getTime() - race.scheduledStartUtc.getTime()) / 1000,
      ),
    },
    entries: { total: entryCount },
    results: {
      total: resultRows.length,
      byStatus: resultStatusBreakdown,
    },
    qualifying: { total: qualifyingCount, sessionKey: race.openf1QualifyingSessionKey },
    picks: { total: pickSetCount, scored: scoreCount },
    latestScore: latestScore
      ? {
          totalScore: latestScore.totalScore,
          computedAt: latestScore.computedAt.toISOString(),
        }
      : null,
    issues,
    healthy: issues.length === 0,
  })
}
