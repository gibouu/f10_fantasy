import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { revokeUserSessions } from "@/lib/services/user.service"

export async function POST() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await revokeUserSessions(session.user.id)

  return NextResponse.json({ ok: true })
}
