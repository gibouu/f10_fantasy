export async function handleFriendsGet(
  request,
  {
    auth,
    mobileAuth,
    searchUsers,
    getFriends,
    getPendingRequests,
    getSentRequests,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(request))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams
  const searchQuery = searchParams.get("search") ?? searchParams.get("q")

  if (searchQuery !== null) {
    const results = await searchUsers(searchQuery, userId)
    return Response.json(results)
  }

  const [friends, pendingReceived, pendingSent] = await Promise.all([
    getFriends(userId),
    getPendingRequests(userId),
    getSentRequests(userId),
  ])

  return Response.json({ friends, pendingReceived, pendingSent })
}
