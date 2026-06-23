import { readJsonObjectBody } from "../../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../../lib/api/errors.js"

const TEAM_UPDATE_DOMAIN_ERRORS = [
  { pattern: /^Unknown team slug:/, status: 400 },
]

export async function handleUsersTeamPatch(
  req,
  {
    auth,
    mobileAuth,
    setFavoriteTeam,
    logger = console,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(req, {
    nonObjectMessage: "slug is required",
  })
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const body = parsedBody.body
  if (!Object.prototype.hasOwnProperty.call(body, "slug")) {
    return Response.json({ error: "slug is required" }, { status: 400 })
  }

  const slugValue = body.slug
  if (slugValue !== null && typeof slugValue !== "string") {
    return Response.json(
      { error: "slug must be a string or null" },
      { status: 400 },
    )
  }

  try {
    await setFavoriteTeam(session.user.id, slugValue)
  } catch (err) {
    return sanitizedErrorResponse(err, {
      domainErrors: TEAM_UPDATE_DOMAIN_ERRORS,
      fallbackMessage: "Failed to update team",
      logger,
      logMessage: "[users/team] Failed to update team",
    })
  }

  return Response.json({ ok: true })
}
