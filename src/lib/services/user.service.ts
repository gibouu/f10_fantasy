/**
 * User profile management service.
 */

import { db } from '@/lib/db/client'
import { TEAMS } from '@/lib/f1/teams'
import type { TeamSlug } from '@/lib/f1/teams'

// ─────────────────────────────────────────────
// Username generation data
// ─────────────────────────────────────────────

const ADJECTIVES = [
  'Red', 'Blue', 'Silver', 'Golden', 'Swift',
  'Iron', 'Midnight', 'Rapid', 'Turbo', 'Carbon',
  'Neon', 'Apex', 'Delta', 'Storm', 'Phantom',
] as const

const NOUNS = [
  'Falcon', 'Wolf', 'Viper', 'Hawk', 'Tiger',
  'Fox', 'Eagle', 'Shark', 'Racer', 'Pilot',
  'Driver', 'Apex', 'Vector', 'Turbo', 'Nitro',
] as const

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

/**
 * Validate a username against the format rules:
 *   - 3–20 characters
 *   - Alphanumeric characters and underscores only
 *   - No leading or trailing underscores
 */
export function validateUsernameFormat(
  username: string,
): { valid: boolean; error?: string } {
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' }
  }

  if (username.length > 20) {
    return { valid: false, error: 'Username must be 20 characters or fewer' }
  }

  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    return { valid: false, error: 'Only letters and numbers allowed.' }
  }

  return { valid: true }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Check if a username is available (case-insensitive lookup).
 * Pass `excludeUserId` to ignore the caller's own record (e.g. during re-set after a partial failure).
 */
export async function isUsernameAvailable(
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  const existing = await db.user.findFirst({
    where: {
      publicUsername: {
        equals: username,
        mode: 'insensitive',
      },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  })

  return existing === null
}

/**
 * Set a user's username during onboarding.
 *
 * Atomically validates format, checks availability, and updates the record.
 * Sets usernameSet = true on the user row.
 *
 * Returns the stored (lowercased) username so callers can display the same
 * value the DB persisted — preventing the iOS optimistic-update from showing
 * one case before relaunch and another after `/api/users/me` reloads it.
 *
 * @throws If the username format is invalid or the username is already taken
 */
export async function setUsername(
  userId: string,
  username: string,
): Promise<string> {
  const formatCheck = validateUsernameFormat(username)
  if (!formatCheck.valid) {
    throw new Error(formatCheck.error ?? 'Invalid username format')
  }

  const stored = username.toLowerCase()

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        publicUsername: { equals: username, mode: 'insensitive' },
        id: { not: userId },
      },
      select: { id: true },
    })
    if (existing) {
      throw new Error(`Username "${username}" is already taken`)
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        publicUsername: stored,
        usernameSet: true,
      },
    })
  })

  return stored
}

/**
 * Change a user's username (allowed once after initial onboarding setup).
 *
 * @throws If the user hasn't set a username yet, has already used their change,
 *         the new username is invalid, or the username is taken.
 */
export async function changeUsername(
  userId: string,
  username: string,
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { usernameSet: true, usernameChangeUsed: true, publicUsername: true },
  })

  if (!user?.usernameSet) {
    throw new Error('You must set a username before changing it')
  }

  if (user.usernameChangeUsed) {
    throw new Error('You have already used your one-time username change')
  }

  const formatCheck = validateUsernameFormat(username)
  if (!formatCheck.valid) {
    throw new Error(formatCheck.error ?? 'Invalid username format')
  }

  if (user.publicUsername?.toLowerCase() === username.toLowerCase()) {
    throw new Error('That is already your username')
  }

  const stored = username.toLowerCase()

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        publicUsername: { equals: username, mode: 'insensitive' },
        id: { not: userId },
      },
      select: { id: true },
    })
    if (existing) {
      throw new Error(`Username "${username}" is already taken`)
    }

    await tx.user.update({
      where: { id: userId },
      data: { publicUsername: stored, usernameChangeUsed: true },
    })
  })

  return stored
}

/**
 * Look up a user profile by their public username (case-insensitive).
 * Returns null if not found.
 */
export async function getUserByUsername(
  username: string,
): Promise<{ id: string; publicUsername: string | null; avatarUrl: string | null } | null> {
  const user = await db.user.findFirst({
    where: {
      publicUsername: {
        equals: username,
        mode: 'insensitive',
      },
    },
    select: { id: true, publicUsername: true, image: true },
  })

  if (!user) return null

  return {
    id: user.id,
    publicUsername: user.publicUsername,
    avatarUrl: user.image,
  }
}

/**
 * Set or clear a user's favourite team slug (used as their leaderboard icon).
 * Pass null to remove the team icon.
 */
export async function setFavoriteTeam(
  userId: string,
  slug: TeamSlug | null,
): Promise<void> {
  if (slug !== null && !TEAMS[slug]) {
    throw new Error(`Unknown team slug: ${slug}`)
  }
  await db.user.update({
    where: { id: userId },
    data: { favoriteTeamSlug: slug },
  })
}

/**
 * Returns whether the tutorial has been dismissed for the given user.
 */
export async function hasDismissedTutorial(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tutorialDismissedAt: true },
  })
  return user?.tutorialDismissedAt != null
}

/**
 * Persist that a signed-in user has completed the tutorial overlay.
 */
export async function dismissTutorial(userId: string): Promise<Date> {
  const user = await db.user.update({
    where: { id: userId },
    data: { tutorialDismissedAt: new Date() },
    select: { tutorialDismissedAt: true },
  })

  if (!user.tutorialDismissedAt) {
    throw new Error('Failed to persist tutorial dismissal')
  }

  return user.tutorialDismissedAt
}

/**
 * Permanently delete a user account and all associated data.
 * Cascade deletes via Prisma schema: Account, Session, PickSet → ScoreBreakdown, FriendRequest.
 */
export async function deleteUser(userId: string): Promise<void> {
  await db.user.delete({ where: { id: userId } })
}

export async function revokeUserSessions(userId: string): Promise<Date> {
  const user = await db.user.update({
    where: { id: userId },
    data: { sessionValidAfter: new Date() },
    select: { sessionValidAfter: true },
  })

  return user.sessionValidAfter
}

/**
 * Generate 3 unique username suggestions in the format `<Adjective><Noun><NN>`.
 * e.g. "BlueFalcon27", "TurboViper14", "ApexShark93"
 *
 * Loops until 3 available candidates are found (bounded to avoid infinite loops
 * in pathological edge cases).
 */
export async function suggestUsernames(): Promise<string[]> {
  const suggestions: string[] = []
  const seen = new Set<string>()
  const maxAttempts = 50

  let attempts = 0

  while (suggestions.length < 3 && attempts < maxAttempts) {
    attempts++

    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    // 2-digit suffix (10–99)
    const num = Math.floor(Math.random() * 90) + 10
    const candidate = `${adj}${noun}${num}`

    if (seen.has(candidate)) continue
    seen.add(candidate)

    const available = await isUsernameAvailable(candidate)
    if (available) {
      suggestions.push(candidate)
    }
  }

  return suggestions
}
