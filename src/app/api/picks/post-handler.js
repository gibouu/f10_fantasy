import { readJsonObjectBody } from "../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../lib/api/errors.js"

const PICK_SAVE_DOMAIN_ERRORS = [
  { pattern: /locked/i, status: 423 },
  { pattern: /^Race not found:/, status: 404 },
  { pattern: /^Race .+ is cancelled/, status: 409 },
  { pattern: /^The following driver IDs are not registered entrants for this race:/, status: 400 },
  { pattern: /^A pick set already exists for this race/, status: 409 },
]

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

  const parsedBody = await readJsonObjectBody(req)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  let input
  try {
    input = createPickSchema.parse(parsedBody.body)
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
    return sanitizedErrorResponse(err, {
      domainErrors: PICK_SAVE_DOMAIN_ERRORS,
      fallbackMessage: "Failed to save pick",
      logger,
      logMessage: "Failed to save pick",
    })
  }
}
