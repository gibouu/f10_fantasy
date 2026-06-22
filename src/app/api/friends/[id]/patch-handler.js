import { readJsonObjectBody } from "../../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../../lib/api/errors.js"

const FRIEND_ACTION_DOMAIN_ERRORS = [
  { pattern: /^Friend request not found:/, status: 404 },
  { pattern: /^Only the addressee can accept a friend request$/, status: 403 },
  { pattern: /^You are not a party to this friend request$/, status: 403 },
  { pattern: /^Friend request is already /, status: 400 },
  { pattern: /^Friend request is no longer pending$/, status: 400 },
  { pattern: /^Cannot reject an already accepted friend request$/, status: 400 },
]

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
    return sanitizedErrorResponse(err, {
      domainErrors: FRIEND_ACTION_DOMAIN_ERRORS,
      fallbackMessage: "Failed to update friend request",
      logger: logError,
      logMessage: "[friends/:id] Failed to update friend request",
    })
  }
}
