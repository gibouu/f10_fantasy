import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { dismissTutorial } from '@/lib/services/user.service'

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dismissed?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is treated as dismiss=true for this simple endpoint.
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
