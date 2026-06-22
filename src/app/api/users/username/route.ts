import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { mobileAuth } from "@/lib/auth/mobileAuth"
import { handleUsernamePost } from "./post-handler"
import {
  validateUsernameFormat,
  setUsername,
  isUsernameAvailable,
  changeUsername,
} from "@/lib/services/user.service"
import { readJsonObjectBody } from "@/lib/api/request-body"
import { sanitizedErrorResponse, type DomainErrorRule } from "@/lib/api/errors"
import { getClientIp, rateLimit } from "@/lib/security/rate-limit"

export const dynamic = "force-dynamic"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
}

const USERNAME_CHANGE_DOMAIN_ERRORS: DomainErrorRule[] = [
  { pattern: /already taken/, status: 409 },
  { pattern: /^You must set a username before changing it$/, status: 400 },
  { pattern: /^You have already used your one-time username change$/, status: 400 },
  { pattern: /^That is already your username$/, status: 400 },
  { pattern: /^Username must /, status: 400 },
  { pattern: /^Only letters and numbers allowed\.$/, status: 400 },
  { pattern: /^Invalid username format$/, status: 400 },
]

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/username — set username during onboarding
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return handleUsernamePost(req, {
    auth,
    mobileAuth,
    setUsername,
    validateUsernameFormat,
    isUniqueConstraintError: (err: unknown) =>
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002",
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/username — one-time username change (after onboarding)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(req, {
    nonObjectMessage: "username must be a non-empty string",
  })
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const { username } = parsedBody.body

  if (typeof username !== "string" || !username) {
    return NextResponse.json(
      { error: "username must be a non-empty string" },
      { status: 400 },
    )
  }

  let stored: string
  try {
    stored = await changeUsername(session.user.id, username)
  } catch (err) {
    return sanitizedErrorResponse(err, {
      domainErrors: [
        {
          when: (error) =>
            error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
          message: "Username is already taken",
          status: 409,
        },
        ...USERNAME_CHANGE_DOMAIN_ERRORS,
      ],
      fallbackMessage: "Failed to change username",
      logMessage: "[users/username] Failed to change username",
    })
  }

  return NextResponse.json({ ok: true, username: stored })
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
