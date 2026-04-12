import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { mobileAuth } from "@/lib/auth/mobileAuth"
import {
  createOrUpdatePick,
  getPickForRace,
  CreatePickSchema,
} from "@/lib/services/pick.service"
import { isRaceLocked } from "@/lib/services/lock.service"
import { ZodError } from "zod"

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/picks — create or update a pick set
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Validate input shape with the same Zod schema used by the service
  let input: ReturnType<typeof CreatePickSchema.parse>
  try {
    input = CreatePickSchema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: err.issues },
        { status: 400 },
      )
    }
    throw err
  }

  try {
    const pick = await createOrUpdatePick(session.user.id, input)
    return NextResponse.json({ pick })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    // "locked" signals appear in the error message from both isRaceLocked
    // and isPickSetLocked checks inside the service.
    if (message.toLowerCase().includes("locked")) {
      return NextResponse.json({ error: message }, { status: 423 }) // 423 Locked
    }

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    return NextResponse.json({ error: message }, { status: 400 })
  }
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
