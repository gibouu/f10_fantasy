import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { mobileAuth } from "@/lib/auth/mobileAuth"
import {
  createOrUpdatePick,
  getPickForRace,
  CreatePickSchema,
} from "@/lib/services/pick.service"
import { ZodError } from "zod"
import { handlePickPost } from "./post-handler"

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/picks — create or update a pick set
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return handlePickPost(req, {
    auth,
    mobileAuth,
    createPickSchema: CreatePickSchema,
    createOrUpdatePick,
    isValidationError: (err: unknown) => err instanceof ZodError,
    getValidationIssues: (err: ZodError) => err.issues,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/picks?raceId=<id> — fetch a user's pick for a specific race
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const raceId = req.nextUrl.searchParams.get("raceId")
  if (!raceId) {
    return NextResponse.json(
      { error: "Missing required query parameter: raceId" },
      { status: 400 },
    )
  }

  const pick = await getPickForRace(session.user.id, raceId)
  if (!pick) {
    return NextResponse.json({ error: "Pick not found" }, { status: 404 })
  }

  return NextResponse.json({ pick })
}
