export async function handleLeaderboardGet(
  request,
  {
    auth,
    mobileAuth,
    getActiveSeason,
    getGlobalLeaderboard,
    getFriendsLeaderboard,
    getUserLeaderboardRank,
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

  const rows =
    scope === "friends"
      ? await getFriendsLeaderboard(userId, seasonId, sort)
      : await getGlobalLeaderboard(seasonId, sort, 20)

  const userRank = userId ? await getUserLeaderboardRank(userId, seasonId, sort) : null
  const userRow = userId ? (rows.find((row) => row.userId === userId) ?? null) : null

  return Response.json({ rows, userRank, userRow })
}
