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
    console.warn("[f10:cron:scores] unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  let raceId: string | undefined
  let raceType: "MAIN" | "SPRINT" | undefined

  try {
    const body = await req.json()
    if (typeof body?.raceId === "string") raceId = body.raceId
    if (body?.raceType === "MAIN" || body?.raceType === "SPRINT") raceType = body.raceType
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

    console.log(`[f10:cron:scores] mode=byType type=${raceType} count=${races.length}`)

    const results: Array<{ raceId: string; computed: number; error?: string }> = []

    for (const race of races) {
      try {
        const computed = await computeAndStoreScoresForRace(race.id)
        results.push({ raceId: race.id, computed })
        console.log(`[f10:cron:scores] OK raceId=${race.id} computed=${computed}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        results.push({ raceId: race.id, computed: 0, error: message })
        console.error(`[f10:cron:scores] FAIL raceId=${race.id}: ${message}`)
      }
    }

    console.log(`[f10:cron:scores] done in ${Date.now() - startedAt}ms`)
    return NextResponse.json({ raceType, processed: results })
  }

  if (!raceId) {
    const lastCompleted = await db.race.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { scheduledStartUtc: "desc" },
      select: { id: true, name: true },
    })

    if (!lastCompleted) {
      console.warn("[f10:cron:scores] no completed races to score")
      return NextResponse.json(
        { error: "No completed races found to score" },
        { status: 404 },
      )
    }

    raceId = lastCompleted.id
    console.log(`[f10:cron:scores] auto-resolved raceId=${raceId} (${lastCompleted.name})`)
  } else {
    console.log(`[f10:cron:scores] targeted raceId=${raceId}`)
  }

  let computed: number
  try {
    computed = await computeAndStoreScoresForRace(raceId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`[f10:cron:scores] FAIL raceId=${raceId}: ${message}`)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  console.log(
    `[f10:cron:scores] OK raceId=${raceId} computed=${computed} (${Date.now() - startedAt}ms)`,
  )
  return NextResponse.json({ computed, raceId })
}
