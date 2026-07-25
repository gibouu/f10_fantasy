export const USERS_ME_PROFILE_SELECT = {
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
}

function serializeUser(user) {
  return {
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
  }
}

export async function handleUsersMeGet(
  req,
  {
    auth,
    mobileAuth,
    db,
  },
) {
  let session = await auth()
  let hydratedUser = null

  if (!session) {
    session = await mobileAuth(req, { userSelect: USERS_ME_PROFILE_SELECT })
    if (session && session.databaseUser?.id === session.user?.id) {
      hydratedUser = session.databaseUser
    }
  }

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user =
    hydratedUser ??
    (await db.user.findUnique({
      where: { id: session.user.id },
      select: USERS_ME_PROFILE_SELECT,
    }))

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 })
  }

  return Response.json(serializeUser(user))
}
