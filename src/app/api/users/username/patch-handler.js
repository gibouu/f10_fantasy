import { readJsonObjectBody } from "../../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../../lib/api/errors.js"
import {
  USERNAME_CHANGE_DOMAIN_ERRORS,
  uniqueUsernameConflictRule,
} from "./username-errors.js"

export async function handleUsernamePatch(
  req,
  {
    auth,
    mobileAuth,
    changeUsername,
    isUniqueConstraintError = (_err) => false,
    logger = console,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedBody = await readJsonObjectBody(req, {
    nonObjectMessage: "username must be a non-empty string",
  })
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const { username } = parsedBody.body

  if (typeof username !== "string" || !username) {
    return Response.json(
      { error: "username must be a non-empty string" },
      { status: 400 },
    )
  }

  let stored
  try {
    stored = await changeUsername(session.user.id, username)
  } catch (err) {
    return sanitizedErrorResponse(err, {
      domainErrors: [
        uniqueUsernameConflictRule(isUniqueConstraintError),
        ...USERNAME_CHANGE_DOMAIN_ERRORS,
      ],
      fallbackMessage: "Failed to change username",
      logger,
      logMessage: "[users/username] Failed to change username",
    })
  }

  return Response.json({ ok: true, username: stored })
}
