import { readJsonObjectBody } from "../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../lib/api/errors.js"

const FRIEND_REQUEST_DOMAIN_ERRORS = [
  { pattern: /^Friend request recipient not found$/, status: 404 },
  { pattern: /^You cannot send a friend request to yourself$/, status: 400 },
  { pattern: /^You are already friends with this user$/, status: 409 },
  { pattern: /^A friend request already exists between these users$/, status: 409 },
]

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
    return sanitizedErrorResponse(err, {
      domainErrors: FRIEND_REQUEST_DOMAIN_ERRORS,
      fallbackMessage: "Failed to send friend request",
      logger: logError,
      logMessage: "[friends] Failed to send friend request",
    })
  }
}
