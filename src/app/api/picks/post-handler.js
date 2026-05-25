export async function handlePickPost(
  req,
  {
    auth,
    mobileAuth,
    createPickSchema,
    createOrUpdatePick,
    isValidationError,
    getValidationIssues,
    logger = console,
  },
) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let input
  try {
    input = createPickSchema.parse(body)
  } catch (err) {
    if (isValidationError(err)) {
      return Response.json(
        { error: "Validation failed", issues: getValidationIssues(err) },
        { status: 400 },
      )
    }
    throw err
  }

  try {
    const pick = await createOrUpdatePick(session.user.id, input)
    return Response.json({ pick })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (message.toLowerCase().includes("locked")) {
      return Response.json({ error: message }, { status: 423 })
    }

    if (message.includes("not found")) {
      return Response.json({ error: message }, { status: 404 })
    }

    logger.error("Failed to save pick", err)
    return Response.json({ error: "Failed to save pick" }, { status: 500 })
  }
}
