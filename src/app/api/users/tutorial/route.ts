import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { readJsonObjectBody } from '@/lib/api/request-body'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { dismissTutorial } from '@/lib/services/user.service'

export async function PATCH(request: NextRequest) {
  const session = (await auth()) ?? (await mobileAuth(request))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(request, { allowEmpty: true })
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const body = parsedBody.body

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
