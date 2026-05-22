import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { dismissTutorial } from '@/lib/services/user.service'

export async function PATCH(request: NextRequest) {
  const session = (await auth()) ?? (await mobileAuth(request))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dismissed?: unknown } = {}
  const rawBody = await request.text()
  if (rawBody.trim().length > 0) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }

  if (body.dismissed === false) {
    return NextResponse.json({ error: 'dismissed must be true' }, { status: 400 })
  }

  try {
    const tutorialDismissedAt = await dismissTutorial(session.user.id)
    return NextResponse.json({
      tutorialDismissedAt: tutorialDismissedAt.toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update tutorial state'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
