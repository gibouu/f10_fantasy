import { readJsonObjectBody } from "../../../lib/api/request-body.js"

const DOMAIN_ERROR_STATUSES = [
  [/^Friend request recipient not found$/, 404],
  [/^You cannot send a friend request to yourself$/, 400],
  [/^You are already friends with this user$/, 409],
  [/^A friend request already exists between these users$/, 409],
]

function mapDomainError(message) {
  return DOMAIN_ERROR_STATUSES.find(([pattern]) => pattern.test(message))?.[1] ?? null
}

export async function handleFriendRequestPost(
  request,
  {
    auth,
    mobileAuth,
    sendFriendRequest,
    logError = console.error,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(request))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(request, {
    nonObjectMessage: "addresseeId is required",
  })
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const addresseeId = parsedBody.body.addresseeId
  if (typeof addresseeId !== "string" || !addresseeId) {
    return Response.json({ error: "addresseeId is required" }, { status: 400 })
  }

  try {
    const friendRequest = await sendFriendRequest(session.user.id, addresseeId)
    return Response.json(friendRequest, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send friend request"
    const domainStatus = mapDomainError(message)
    if (domainStatus) {
      return Response.json({ error: message }, { status: domainStatus })
    }

    logError("[friends] Failed to send friend request", err)
    return Response.json(
      { error: "Failed to send friend request" },
      { status: 500 },
    )
  }
}
