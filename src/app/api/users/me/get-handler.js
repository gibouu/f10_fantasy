export async function handleUsersMeGet(
  req,
  {
    auth,
    mobileAuth,
    db,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      publicUsername: true,
      usernameSet: true,
      usernameChangeUsed: true,
      favoriteTeamSlug: true,
      tutorialDismissedAt: true,
      createdAt: true,
    },
  })

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 })
  }

  return Response.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.image,
    publicUsername: user.publicUsername,
    usernameSet: user.usernameSet,
    usernameChangeUsed: user.usernameChangeUsed,
    favoriteTeamSlug: user.favoriteTeamSlug,
    tutorialDismissedAt: user.tutorialDismissedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  })
}
