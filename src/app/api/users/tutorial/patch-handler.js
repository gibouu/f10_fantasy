import { sanitizedErrorResponse } from "../../../../lib/api/errors.js"
import { readJsonObjectBody } from "../../../../lib/api/request-body.js"

export async function handleTutorialPatch(
  request,
  {
    auth,
    mobileAuth,
    dismissTutorial,
    logger = console.error,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(request))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(request, { allowEmpty: true })
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  if (parsedBody.body.dismissed === false) {
    return Response.json({ error: "dismissed must be true" }, { status: 400 })
  }

  try {
    const tutorialDismissedAt = await dismissTutorial(session.user.id)
    return Response.json({
      tutorialDismissedAt: tutorialDismissedAt.toISOString(),
    })
  } catch (error) {
    return sanitizedErrorResponse(error, {
      fallbackMessage: "Failed to update tutorial state",
      logger,
      logMessage: "[users/tutorial] Failed to update tutorial state",
    })
  }
}
