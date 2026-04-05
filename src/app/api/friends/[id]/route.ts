import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  acceptFriendRequest,
  rejectFriendRequest,
} from '@/lib/services/friendship.service'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const requestId = params.id

  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.action !== 'accept' && body.action !== 'reject') {
    return NextResponse.json(
      { error: 'action must be "accept" or "reject"' },
      { status: 400 }
    )
  }

  try {
    if (body.action === 'accept') {
      await acceptFriendRequest(requestId, userId)
    } else {
      await rejectFriendRequest(requestId, userId)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update request'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
