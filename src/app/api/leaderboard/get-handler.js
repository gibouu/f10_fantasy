export async function handleLeaderboardGet(
  request,
  {
    auth,
    mobileAuth,
    getActiveSeason,
    getGlobalLeaderboardResult,
    getFriendsLeaderboard,
    getUserLeaderboardRank,
    validateLeaderboardSort,
  },
) {
  const { searchParams } = request.nextUrl
  const scope = searchParams.get("scope") === "friends" ? "friends" : "global"
  const sort = searchParams.get("sort") ?? "season"

  const session = (await auth()) ?? (await mobileAuth(request))
  const userId = session?.user?.id ?? null
  if (scope === "friends" && !userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const seasonIdParam = searchParams.get("seasonId")
  let seasonId = seasonIdParam

  if (!seasonId) {
    const active = await getActiveSeason()
    seasonId = active?.id ?? null
  }

  if (!seasonId) {
    return Response.json({ rows: [], userRank: null, userRow: null })
  }

  if (!(await validateLeaderboardSort(seasonId, sort))) {
    return Response.json({ error: "Invalid race id" }, { status: 400 })
  }

  const leaderboard =
    scope === "friends"
      ? {
          rows: await getFriendsLeaderboard(userId, seasonId, sort),
          userRank: userId ? await getUserLeaderboardRank(userId, seasonId, sort) : null,
        }
      : await getGlobalLeaderboardResult(seasonId, sort, 20, userId)

  const userRow = userId ? (leaderboard.rows.find((row) => row.userId === userId) ?? null) : null

  return Response.json({ rows: leaderboard.rows, userRank: leaderboard.userRank, userRow })
}
