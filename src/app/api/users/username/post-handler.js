import { readJsonObjectBody } from "../../../../lib/api/request-body.js"

export async function handleUsernamePost(
  req,
  {
    auth,
    mobileAuth,
    setUsername,
    validateUsernameFormat,
    isUniqueConstraintError = (_err) => false,
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
    if (isUniqueConstraintError(err)) {
      return Response.json({ error: "Username is already taken" }, { status: 409 })
    }

    const message = err instanceof Error ? err.message : "Unknown error"

    if (message.includes("already taken")) {
      return Response.json({ error: message }, { status: 409 })
    }

    return Response.json({ error: message }, { status: 400 })
  }

  return Response.json({ ok: true, username: stored })
}
