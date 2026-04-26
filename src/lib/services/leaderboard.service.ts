/**
 * Leaderboard aggregation service.
 *
 * Tie-break order:
 *   1. totalScore DESC
 *   2. exactTenthHits DESC (races where tenth place score was at maximum)
 *   3. winnerHits DESC
 *   4. dnfHits DESC
 *   5. userId ASC (stable alphabetical fallback)
 */

import { db } from '@/lib/db/client'
import type { LeaderboardRow } from '@/types/domain'
import { getScoringCaps } from '@/lib/scoring/formula'
import { TEAMS } from '@/lib/f1/teams'
import type { TeamSlug } from '@/lib/f1/teams'

// ─────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────

type AggregatedRow = {
  userId: string
  publicUsername: string | null
  avatarUrl: string | null
  teamLogoUrl: string | null
  teamColor: string | null
  totalScore: number
  exactTenthHits: number
  winnerHits: number
  dnfHits: number
}

// ─────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────

/**
 * Aggregate scores for a set of user IDs in a given season.
 * If `lastRaceOnly` is true, only the most recently completed race is counted.
 */
/**
 * filter: 'season' = all completed races, any other string = specific raceId
 */
async function aggregateScores(
  userIds: string[],
  seasonId: string,
  filter: 'season' | string,
): Promise<AggregatedRow[]> {
  if (userIds.length === 0) return []

  // Build the race WHERE clause
  const raceWhere =
    filter === 'season'
      ? { seasonId, status: 'COMPLETED' as const }
      : { seasonId, status: 'COMPLETED' as const, id: filter }

  // If filtering to a specific race, verify it exists
  if (filter !== 'season') {
    const exists = await db.race.findFirst({ where: raceWhere, select: { id: true } })
    if (!exists) return await buildZeroedRows(userIds)
  }

  // Load all pick sets with score breakdowns and race type info for the target users
  const pickSets = await db.pickSet.findMany({
    where: {
      userId: { in: userIds },
      race: raceWhere,
      scoreBreakdown: { isNot: null },
    },
    select: {
      userId: true,
      scoreBreakdown: {
        select: {
          tenthPlaceScore: true,
          winnerBonus: true,
          dnfBonus: true,
          totalScore: true,
        },
      },
      race: {
        select: { type: true },
      },
    },
  })

  // Load user profile data
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, publicUsername: true, image: true, favoriteTeamSlug: true },
  })

  const userMap = new Map(users.map((u) => [u.id, u]))

  // Aggregate by userId
  const aggregated = new Map<string, AggregatedRow>()

  // Seed all requested users with zero scores
  for (const uid of userIds) {
    const user = userMap.get(uid)
    const team = user?.favoriteTeamSlug ? TEAMS[user.favoriteTeamSlug as TeamSlug] : null
    aggregated.set(uid, {
      userId: uid,
      publicUsername: user?.publicUsername ?? null,
      avatarUrl: user?.image ?? null,
      teamLogoUrl: team?.logoUrl ?? null,
      teamColor: team?.color ?? null,
      totalScore: 0,
      exactTenthHits: 0,
      winnerHits: 0,
      dnfHits: 0,
    })
  }

  // Accumulate scores
  for (const ps of pickSets) {
    if (!ps.scoreBreakdown) continue

    const row = aggregated.get(ps.userId)
    if (!row) continue

    const caps = getScoringCaps(ps.race.type)

    row.totalScore += ps.scoreBreakdown.totalScore

    if (ps.scoreBreakdown.tenthPlaceScore === caps.p10) {
      row.exactTenthHits += 1
    }
    if (ps.scoreBreakdown.winnerBonus === caps.winner) {
      row.winnerHits += 1
    }
    if (ps.scoreBreakdown.dnfBonus === caps.dnf) {
      row.dnfHits += 1
    }
  }

  return Array.from(aggregated.values())
}

/** Build zeroed rows for users when there are no completed races */
async function buildZeroedRows(userIds: string[]): Promise<AggregatedRow[]> {
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, publicUsername: true, image: true, favoriteTeamSlug: true },
  })

  return users.map((u) => {
    const team = u.favoriteTeamSlug ? TEAMS[u.favoriteTeamSlug as TeamSlug] : null
    return {
      userId: u.id,
      publicUsername: u.publicUsername,
      avatarUrl: u.image,
      teamLogoUrl: team?.logoUrl ?? null,
      teamColor: team?.color ?? null,
      totalScore: 0,
      exactTenthHits: 0,
      winnerHits: 0,
      dnfHits: 0,
    }
  })
}

/**
 * Sort rows by tie-break rules and assign sequential ranks.
 * Equal scores receive the same rank (dense ranking not used — standard ranking).
 */
function rankRows(rows: AggregatedRow[]): LeaderboardRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    if (b.exactTenthHits !== a.exactTenthHits) return b.exactTenthHits - a.exactTenthHits
    if (b.winnerHits !== a.winnerHits) return b.winnerHits - a.winnerHits
    if (b.dnfHits !== a.dnfHits) return b.dnfHits - a.dnfHits
    // Stable alphabetical fallback
    return a.userId.localeCompare(b.userId)
  })

  return sorted.map((row, index) => ({
    rank: index + 1,
    ...row,
  }))
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Get the global leaderboard for a season.
 *
 * @param seasonId - Target season
 * @param sort     - 'season' sums all completed races; any other string = specific raceId
 *                   most recently completed race
 * @param limit    - Maximum number of rows to return (default 20)
 */
export async function getGlobalLeaderboard(
  seasonId: string,
  sort: string,
  limit = 20,
): Promise<LeaderboardRow[]> {
  // Find all users who have submitted at least one scored pick in this season
  const userIdsRaw = await db.pickSet.findMany({
    where: {
      race: { seasonId },
      scoreBreakdown: { isNot: null },
    },
    select: { userId: true },
    distinct: ['userId'],
  })

  const userIds = userIdsRaw.map((r) => r.userId)
  if (userIds.length === 0) return []

  const rows = await aggregateScores(userIds, seasonId, sort)
  return rankRows(rows).slice(0, limit)
}

/**
 * Get the leaderboard for a user and their accepted friends.
 */
export async function getFriendsLeaderboard(
  userId: string,
  seasonId: string,
  sort: string,
): Promise<LeaderboardRow[]> {
  // Find all accepted friend relationships where userId is either party
  const friendRequests = await db.friendRequest.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  })

  const friendIds = friendRequests.map((fr) =>
    fr.requesterId === userId ? fr.addresseeId : fr.requesterId,
  )

  // Include the requesting user themselves
  const allIds = Array.from(new Set([userId, ...friendIds]))

  const rows = await aggregateScores(allIds, seasonId, sort)
  return rankRows(rows)
}

/**
 * Get a single user's rank on the global season leaderboard.
 * Returns null if the user has no scored picks in the season.
 */
export async function getUserSeasonRank(
  userId: string,
  seasonId: string,
): Promise<number | null> {
  const leaderboard = await getGlobalLeaderboard(seasonId, 'season', 10_000)
  const entry = leaderboard.find((row) => row.userId === userId)
  return entry?.rank ?? null
}
