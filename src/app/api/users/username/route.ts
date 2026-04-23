import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { mobileAuth } from "@/lib/auth/mobileAuth"
import {
  validateUsernameFormat,
  setUsername,
  isUsernameAvailable,
  changeUsername,
} from "@/lib/services/user.service"
import { getClientIp, rateLimit } from "@/lib/security/rate-limit"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/username — set username during onboarding
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

  const { username } = body as { username?: unknown }

  if (typeof username !== "string" || !username) {
    return NextResponse.json(
      { error: "username must be a non-empty string" },
      { status: 400 },
    )
  }

  // Validate format first — avoid the DB round-trip for obviously invalid input
  const formatCheck = validateUsernameFormat(username)
  if (!formatCheck.valid) {
    return NextResponse.json({ error: formatCheck.error }, { status: 400 })
  }

  try {
    // setUsername internally re-validates format + checks availability atomically
    await setUsername(session.user.id, username)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (message.includes("already taken")) {
      return NextResponse.json({ error: message }, { status: 409 })
    }

    return NextResponse.json({ error: message }, { status: 400 })
  }

  // The client calls next-auth's update() after this to refresh the JWT token.
  // We return the username so the client can pass it directly to update().
  return NextResponse.json({ ok: true, username })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/username — one-time username change (after onboarding)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
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

  const { username } = body as { username?: unknown }

  if (typeof username !== "string" || !username) {
    return NextResponse.json(
      { error: "username must be a non-empty string" },
      { status: 400 },
    )
  }

  try {
    await changeUsername(session.user.id, username)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("already taken")) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, username })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/username/check?username=<value> — availability check
// No auth required — called while the user types.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const limit = rateLimit({
    key: `username-check:${getClientIp(req)}`,
    limit: 30,
    windowMs: 60 * 1000,
  })

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many username checks. Please retry shortly." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": "0",
        },
      },
    )
  }

  const username = req.nextUrl.searchParams.get("username")

  if (!username) {
    return NextResponse.json(
      { error: "Missing required query parameter: username" },
      {
        status: 400,
        headers: {
          ...NO_STORE_HEADERS,
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    )
  }

  // Validate format before hitting the DB
  const formatCheck = validateUsernameFormat(username)
  if (!formatCheck.valid) {
    // An invalid format is technically "unavailable" from the user's perspective
    return NextResponse.json(
      { available: false, reason: formatCheck.error },
      {
        headers: {
          ...NO_STORE_HEADERS,
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    )
  }

  const available = await isUsernameAvailable(username)
  return NextResponse.json(
    { available },
    {
      headers: {
        ...NO_STORE_HEADERS,
        "X-RateLimit-Limit": "30",
        "X-RateLimit-Remaining": String(limit.remaining),
      },
    },
  )
}
