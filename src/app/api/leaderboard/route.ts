import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  getGlobalLeaderboard,
  getFriendsLeaderboard,
  getUserSeasonRank,
} from '@/lib/services/leaderboard.service'
import { getActiveSeason } from '@/lib/services/race.service'

export async function GET(request: NextRequest) {
  // Auth check
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  // Parse query params
  const { searchParams } = request.nextUrl
  const scope = searchParams.get('scope') === 'friends' ? 'friends' : 'global'
  // sort = 'season' (full season) or a specific raceId
  const sort = searchParams.get('sort') ?? 'season'

  // Determine season — prefer explicit param, fall back to active season
  const seasonIdParam = searchParams.get('seasonId')
  let seasonId: string | null = seasonIdParam

  if (!seasonId) {
    const active = await getActiveSeason()
    seasonId = active?.id ?? null
  }

  if (!seasonId) {
    return NextResponse.json({ rows: [], userRank: null, userRow: null })
  }

  // Fetch rows
  const rows =
    scope === 'friends'
      ? await getFriendsLeaderboard(userId, seasonId, sort)
      : await getGlobalLeaderboard(seasonId, sort, 20)

  // User's own rank on the global season board (for pinned row logic)
  const userRank = await getUserSeasonRank(userId, seasonId)

  // Find the user's row in the returned set (may be null if they're outside top 20)
  const userRow = rows.find((r) => r.userId === userId) ?? null

  return NextResponse.json({ rows, userRank, userRow })
}
