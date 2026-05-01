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
    console.warn("[f10:cron:lock] unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const now = new Date()

  // Find all races that:
  //   - Are still in play (UPCOMING or LIVE — explicitly allowlisted to avoid
  //     touching COMPLETED or CANCELLED races; `not: "COMPLETED"` historically
  //     matched CANCELLED races whose start time had passed and incorrectly
  //     flipped them to LIVE).
  //   - Have passed their lock cutoff
  const racesToLock = await db.race.findMany({
    where: {
      status: { in: ["UPCOMING", "LIVE"] },
      lockCutoffUtc: { lte: now },
    },
    select: {
      id: true,
      status: true,
      scheduledStartUtc: true,
      name: true,
    },
  })

  console.log(
    `[f10:cron:lock] candidates=${racesToLock.length} now=${now.toISOString()}`,
  )

  let lockedRaces = 0
  let totalPicksLocked = 0

  for (const race of racesToLock) {
    // Lock all unlocked pick sets for this race
    const picksLocked = await lockPicksForRace(race.id)
    totalPicksLocked += picksLocked

    const newStatus =
      race.scheduledStartUtc <= now && race.status !== "LIVE"
        ? "LIVE"
        : undefined

    if (newStatus) {
      await db.race.update({
        where: { id: race.id },
        data: { status: newStatus },
      })
    }

    console.log(
      `[f10:cron:lock] race=${race.id} (${race.name}) oldStatus=${race.status} newStatus=${newStatus ?? race.status} picksLocked=${picksLocked}`,
    )

    lockedRaces++
  }

  console.log(
    `[f10:cron:lock] done in ${Date.now() - startedAt}ms lockedRaces=${lockedRaces} totalPicksLocked=${totalPicksLocked}`,
  )

  return NextResponse.json({ lockedRaces, totalPicksLocked })
}
