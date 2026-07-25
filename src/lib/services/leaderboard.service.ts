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
import { getScoringCaps } from '@/lib/scoring/formula'
import { TEAMS } from '@/lib/f1/teams'
import type { TeamSlug } from '@/lib/f1/teams'
import type { LeaderboardRow } from '@/types/domain'
import { rankRows } from './leaderboard-rank'

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

function raceWhereForSort(seasonId: string, sort: string) {
  return sort === 'season'
    ? { seasonId, status: 'COMPLETED' as const }
    : { seasonId, status: 'COMPLETED' as const, id: sort }
}

async function getScoredUserIdsForSort(
  seasonId: string,
  sort: string,
  userIds?: string[],
): Promise<string[]> {
  const pickSets = await db.pickSet.findMany({
    where: {
      ...(userIds ? { userId: { in: userIds } } : {}),
      race: raceWhereForSort(seasonId, sort),
      scoreBreakdown: { isNot: null },
    },
    select: { userId: true },
    distinct: ['userId'],
  })

  return pickSets.map((r) => r.userId)
}

async function getRankedGlobalLeaderboard(
  seasonId: string,
  sort: string,
): Promise<LeaderboardRow[]> {
  const userIds = await getScoredUserIdsForSort(seasonId, sort)
  if (userIds.length === 0) return []

  const rows = await aggregateScores(userIds, seasonId, sort)
  return rankRows(rows)
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
  const rows = await getRankedGlobalLeaderboard(seasonId, sort)
  return rows.slice(0, limit)
}

export async function getGlobalLeaderboardResult(
  seasonId: string,
  sort: string,
  limit = 20,
  userId: string | null = null,
): Promise<{ rows: LeaderboardRow[]; userRank: number | null }> {
  const rankedRows = await getRankedGlobalLeaderboard(seasonId, sort)
  const userRank = userId
    ? (rankedRows.find((row) => row.userId === userId)?.rank ?? null)
    : null

  return {
    rows: rankedRows.slice(0, limit),
    userRank,
  }
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
  const leaderboardUserIds =
    sort === 'season' ? allIds : await getScoredUserIdsForSort(seasonId, sort, allIds)

  const rows = await aggregateScores(leaderboardUserIds, seasonId, sort)
  return rankRows(rows)
}

export async function validateLeaderboardSort(seasonId: string, sort: string): Promise<boolean> {
  if (sort === 'season') return true

  const race = await db.race.findFirst({
    where: { id: sort, seasonId },
    select: { id: true },
  })

  return Boolean(race)
}

/**
 * Get a single user's rank on the selected global leaderboard.
 * Returns null if the user has no scored picks in the season.
 */
export async function getUserLeaderboardRank(
  userId: string,
  seasonId: string,
  sort: string,
): Promise<number | null> {
  const leaderboard = await getRankedGlobalLeaderboard(seasonId, sort)
  const entry = leaderboard.find((row) => row.userId === userId)
  return entry?.rank ?? null
}

export async function getUserSeasonRank(
  userId: string,
  seasonId: string,
): Promise<number | null> {
  return getUserLeaderboardRank(userId, seasonId, 'season')
}
