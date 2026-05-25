/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Supports both cookie-based sessions (web) and Bearer tokens (iOS native).
 *
 * Cascade-deleted via Prisma schema:
 *   Account, Session, PickSet → ScoreBreakdown, FriendRequest (both directions)
 */

import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { deleteUser } from '@/lib/services/user.service'
import { deleteAccountForSession } from './delete-handler'

export async function DELETE(req: Request) {
  return deleteAccountForSession(req, { auth, mobileAuth, deleteUser })
}
