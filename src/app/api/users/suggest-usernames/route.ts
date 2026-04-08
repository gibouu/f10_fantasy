import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { suggestUsernames } from "@/lib/services/user.service"
import { getClientIp, rateLimit } from "@/lib/security/rate-limit"

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/suggest-usernames — return 3 available username suggestions
// No auth required — shown on the onboarding page before sign-in.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const limit = rateLimit({
    key: `username-suggestions:${getClientIp(req)}`,
    limit: 10,
    windowMs: 60 * 1000,
  })

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many suggestion requests. Please retry shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "0",
        },
      },
    )
  }

  const suggestions = await suggestUsernames()
  return NextResponse.json(
    { suggestions },
    {
      headers: {
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": String(limit.remaining),
      },
    },
  )
}
