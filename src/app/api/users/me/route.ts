/**
 * GET /api/users/me
 *
 * Returns the authenticated user's full profile.
 * Used by the iOS app on launch (session restoration) and after onboarding.
 *
 * Supports both cookie-based sessions (web) and Bearer tokens (iOS native).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import { db } from '@/lib/db/client'

export async function GET(req: Request) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      publicUsername: true,
      usernameSet: true,
      usernameChangeUsed: true,
      favoriteTeamSlug: true,
      tutorialDismissedAt: true,
      createdAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.image,
    publicUsername: user.publicUsername,
    usernameSet: user.usernameSet,
    usernameChangeUsed: user.usernameChangeUsed,
    favoriteTeamSlug: user.favoriteTeamSlug,
    tutorialDismissedAt: user.tutorialDismissedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  })
}
