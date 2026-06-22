/**
 * GET /api/users/me
 *
 * Returns the authenticated user's full profile.
 * Used by the iOS app on launch (session restoration) and after onboarding.
 *
 * Supports both cookie-based sessions (web) and Bearer tokens (iOS native).
 */

import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { db } from '@/lib/db/client'
import { handleUsersMeGet } from './get-handler'

export async function GET(req: Request) {
  return handleUsersMeGet(req, {
    auth,
    mobileAuth,
    db,
  })
}
