/**
 * Cron: compute and store scores for completed races.
 *
 * Protected by the CRON_SECRET environment variable.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { db } from "@/lib/db/client"
import { computeAndStoreScoresForRace } from "@/lib/services/scoring.service"

// ─── Auth helper ──────────────────────────────────────────────────────────────

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get("authorization")
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null
  return provided === secret
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/compute-scores
//
// Body (all optional):
//   { raceId?: string }
//   { raceType?: "MAIN" | "SPRINT" }
//
// If raceId is omitted, computes scores for the most recently completed race.
// If raceType is provided, recomputes all completed races of that type.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let raceId: string | undefined
  let raceType: "MAIN" | "SPRINT" | undefined

  // Body is optional — the cron job can call with an empty body
  try {
    const body = await req.json()
    if (typeof body?.raceId === "string") {
      raceId = body.raceId
    }
    if (body?.raceType === "MAIN" || body?.raceType === "SPRINT") {
      raceType = body.raceType
    }
  } catch {
    // No body or invalid JSON — fall through to auto-resolve
  }

  if (raceType) {
    const races = await db.race.findMany({
      where: {
        type: raceType,
        status: "COMPLETED",
        results: { some: {} },
      },
      orderBy: { scheduledStartUtc: "asc" },
      select: { id: true },
    })

    const results: Array<{ raceId: string; computed: number; error?: string }> = []

    for (const race of races) {
      try {
        const computed = await computeAndStoreScoresForRace(race.id)
        results.push({ raceId: race.id, computed })
      } catch (err) {
        results.push({
          raceId: race.id,
          computed: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({ raceType, processed: results })
  }

  // If no raceId provided, find the most recently completed race
  if (!raceId) {
    const lastCompleted = await db.race.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { scheduledStartUtc: "desc" },
      select: { id: true, name: true },
    })

    if (!lastCompleted) {
      return NextResponse.json(
        { error: "No completed races found to score" },
        { status: 404 },
      )
    }

    raceId = lastCompleted.id
  }

  let computed: number
  try {
    computed = await computeAndStoreScoresForRace(raceId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ computed, raceId })
}
