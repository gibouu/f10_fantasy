/**
 * Cron: lock picks for races that have passed their cutoff time.
 *
 * Add to vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/lock-picks", "schedule": "* * * * *" }]
 * }
 * (Run every minute to keep lock timing accurate. Adjust based on cost tolerance.)
 *
 * Protected by the CRON_SECRET environment variable.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db/client"
import { lockPicksForRace } from "@/lib/services/lock.service"

// ─── Auth helper ──────────────────────────────────────────────────────────────

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get("authorization")
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null
  return provided === secret
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/lock-picks
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Find all races that:
  //   - Are not yet completed (UPCOMING or LIVE)
  //   - Have passed their lock cutoff
  const racesToLock = await db.race.findMany({
    where: {
      status: { not: "COMPLETED" },
      lockCutoffUtc: { lte: now },
    },
    select: {
      id: true,
      status: true,
      scheduledStartUtc: true,
      name: true,
    },
  })

  let lockedRaces = 0
  let totalPicksLocked = 0

  for (const race of racesToLock) {
    // Lock all unlocked pick sets for this race
    const picksLocked = await lockPicksForRace(race.id)
    totalPicksLocked += picksLocked

    // Determine the new race status:
    //   - LIVE  if the race has started (scheduledStartUtc <= now)
    //   - Keep existing status otherwise (e.g. UPCOMING with lock passed but not yet started)
    const newStatus =
      race.scheduledStartUtc <= now && race.status !== "LIVE"
        ? "LIVE"
        : undefined

    // Only write if something actually changed
    if (newStatus) {
      await db.race.update({
        where: { id: race.id },
        data: { status: newStatus },
      })
    }

    lockedRaces++
  }

  return NextResponse.json({ lockedRaces, totalPicksLocked })
}
