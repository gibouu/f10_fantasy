import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { mobileAuth } from '@/lib/auth/mobileAuth'
import {
  getGlobalLeaderboard,
  getFriendsLeaderboard,
  getUserLeaderboardRank,
} from '@/lib/services/leaderboard.service'
import { getActiveSeason } from '@/lib/services/race.service'
import { handleLeaderboardGet } from './get-handler'

export async function GET(request: NextRequest) {
  return handleLeaderboardGet(request, {
    auth,
    mobileAuth,
    getActiveSeason,
    getGlobalLeaderboard,
    getFriendsLeaderboard,
    getUserLeaderboardRank,
  })
}
