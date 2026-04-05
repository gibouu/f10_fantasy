import { auth } from "@/auth"
import { getActiveSeason, getRacesForSeason } from "@/lib/services/race.service"
import {
  getGlobalLeaderboard,
  getUserSeasonRank,
} from "@/lib/services/leaderboard.service"
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList"
import { FriendSearch } from "@/components/leaderboard/FriendSearch"

interface LeaderboardSearchParams {
  scope?: string
  sort?: string
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: LeaderboardSearchParams
}) {
  const session = await auth()
  const userId = session!.user!.id!

  const scope = searchParams.scope === "friends" ? "friends" : "global"
  const sort = searchParams.sort ?? "season"

  const season = await getActiveSeason()
  if (!season) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-text-secondary text-sm">No active season</p>
      </div>
    )
  }

  const allRaces = await getRacesForSeason(season.id)
  const completedRaces = allRaces
    .filter((r) => r.status === "COMPLETED")
    .map((r) => ({ id: r.id, round: r.round, name: r.name, type: r.type }))

  const [rows, userRank] = await Promise.all([
    getGlobalLeaderboard(season.id, sort, 50),
    getUserSeasonRank(userId, season.id),
  ])

  const userRow = rows.find((r) => r.userId === userId) ?? null

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <LeaderboardList
        rows={rows}
        userId={userId}
        userRank={userRank}
        userRow={userRow}
        seasonId={season.id}
        initialScope={scope}
        initialSort={sort}
        completedRaces={completedRaces}
        seasonYear={season.year}
      />
      <FriendSearch currentUserId={userId} />
    </div>
  )
}
