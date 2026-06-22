import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { sanitizedErrorResponse } from '@/lib/api/errors'
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
    return sanitizedErrorResponse(error, {
      fallbackMessage: 'Failed to update tutorial state',
      logMessage: '[users/tutorial] Failed to update tutorial state',
    })
  }
}
