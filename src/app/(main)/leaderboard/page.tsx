import { auth } from "@/auth"
import { getActiveSeason, getRacesForSeason } from "@/lib/services/race.service"
import {
  getFriendsLeaderboard,
  getGlobalLeaderboard,
  getUserSeasonRank,
} from "@/lib/services/leaderboard.service"
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList"
import Link from "next/link"

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
  const userId = session?.user?.id ?? null

  // Guests can only see global leaderboard
  const scope = userId && searchParams.scope === "friends" ? "friends" : "global"
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
    scope === "friends" && userId
      ? getFriendsLeaderboard(userId, season.id, sort)
      : getGlobalLeaderboard(season.id, sort, 50),
    userId ? getUserSeasonRank(userId, season.id) : Promise.resolve(null),
  ])

  const userRow = userId ? (rows.find((r) => r.userId === userId) ?? null) : null

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
        isGuest={!userId}
      />
      {!userId && (
        <div className="rounded-2xl bg-surface border border-[var(--border)] p-5 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-text-primary">Join the competition</p>
          <p className="text-xs text-text-secondary">Sign in to make picks, track your score, and compete with friends.</p>
          <Link
            href="/signin?callbackUrl=/leaderboard"
            className="inline-flex items-center justify-center rounded-xl bg-accent text-white text-sm font-semibold px-5 py-2.5"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  )
}
