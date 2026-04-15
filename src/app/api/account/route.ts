/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Supports both cookie-based sessions (web) and Bearer tokens (iOS native).
 *
 * Cascade-deleted via Prisma schema:
 *   Account, Session, PickSet → ScoreBreakdown, FriendRequest (both directions)
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { deleteUser } from '@/lib/services/user.service'

export async function DELETE(req: Request) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteUser(session.user.id)
    console.log(`[account/delete] userId=${session.user.id}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[account/delete] failed:', err)
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 })
  }
}
