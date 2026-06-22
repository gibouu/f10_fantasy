import { readJsonObjectBody } from "../../../../lib/api/request-body.js"

const DOMAIN_ERROR_STATUSES = [
  [/^Friend request not found:/, 404],
  [/^Only the addressee can accept a friend request$/, 403],
  [/^You are not a party to this friend request$/, 403],
  [/^Friend request is already /, 400],
  [/^Friend request is no longer pending$/, 400],
  [/^Cannot reject an already accepted friend request$/, 400],
]

function mapDomainError(message) {
  return DOMAIN_ERROR_STATUSES.find(([pattern]) => pattern.test(message))?.[1] ?? null
}

export async function handleFriendRequestPatch(
  request,
  params,
  {
    auth,
    mobileAuth,
    acceptFriendRequest,
    rejectFriendRequest,
    logError = console.error,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(request))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const requestId = params.id

  const parsedBody = await readJsonObjectBody(request, {
    invalidJsonMessage: "Invalid request body",
    nonObjectMessage: 'action must be "accept" or "reject"',
  })
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const body = parsedBody.body

  if (body.action !== "accept" && body.action !== "reject") {
    return Response.json(
      { error: 'action must be "accept" or "reject"' },
      { status: 400 },
    )
  }

  try {
    if (body.action === "accept") {
      await acceptFriendRequest(requestId, userId)
    } else {
      await rejectFriendRequest(requestId, userId)
    }
    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update request"
    const domainStatus = mapDomainError(message)
    if (domainStatus) {
      return Response.json({ error: message }, { status: domainStatus })
    }

    logError("[friends/:id] Failed to update friend request", err)
    return Response.json(
      { error: "Failed to update friend request" },
      { status: 500 },
    )
  }
}
