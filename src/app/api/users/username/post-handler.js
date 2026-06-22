import { readJsonObjectBody } from "../../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../../lib/api/errors.js"

const USERNAME_SET_DOMAIN_ERRORS = [
  { pattern: /^Username is already set$/, status: 400 },
  { pattern: /already taken/, status: 409 },
  { pattern: /^Username must /, status: 400 },
  { pattern: /^Only letters and numbers allowed\.$/, status: 400 },
  { pattern: /^Invalid username format$/, status: 400 },
]

export async function handleUsernamePost(
  req,
  {
    auth,
    mobileAuth,
    setUsername,
    validateUsernameFormat,
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

  const formatCheck = validateUsernameFormat(username)
  if (!formatCheck.valid) {
    return Response.json({ error: formatCheck.error }, { status: 400 })
  }

  let stored
  try {
    stored = await setUsername(session.user.id, username)
  } catch (err) {
    return sanitizedErrorResponse(err, {
      domainErrors: [
        {
          when: isUniqueConstraintError,
          message: "Username is already taken",
          status: 409,
        },
        ...USERNAME_SET_DOMAIN_ERRORS,
      ],
      fallbackMessage: "Failed to set username",
      logger,
      logMessage: "[users/username] Failed to set username",
    })
  }

  return Response.json({ ok: true, username: stored })
}
