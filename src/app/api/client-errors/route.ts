import { NextResponse } from "next/server"
import { sanitizeClientErrorPayload } from "@/lib/observability/client-errors"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const event = sanitizeClientErrorPayload(body)
  if (!event) {
    return NextResponse.json(
      { error: "Invalid client error payload" },
      { status: 400 },
    )
  }

  console.error("[f10:client-error]", event)

  return NextResponse.json({ ok: true })
}
