import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { mobileAuth } from "@/lib/auth/mobileAuth"
import { revokeUserSessions } from "@/lib/services/user.service"

export async function POST(req: Request) {
  const session = (await auth()) ?? (await mobileAuth(req))

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await revokeUserSessions(session.user.id)

  return NextResponse.json({ ok: true })
}
