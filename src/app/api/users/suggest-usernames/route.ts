import { NextResponse } from "next/server"
import { suggestUsernames } from "@/lib/services/user.service"

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/suggest-usernames — return 3 available username suggestions
// No auth required — shown on the onboarding page before sign-in.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const suggestions = await suggestUsernames()
  return NextResponse.json({ suggestions })
}
