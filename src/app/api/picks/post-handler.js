import { readJsonObjectBody } from "../../../lib/api/request-body.js"
import { sanitizedErrorResponse } from "../../../lib/api/errors.js"

const PICK_SAVE_DOMAIN_ERRORS = [
  { pattern: /locked/i, status: 423 },
  { pattern: /^Race not found:/, status: 404 },
  { pattern: /^Race .+ is cancelled/, status: 409 },
  { pattern: /^The following driver IDs are not registered entrants for this race:/, status: 400 },
  { pattern: /^A pick set already exists for this race/, status: 409 },
  { pattern: /^Invalid pick base version$/, status: 400 },
]

function normalizeIfMatch(value) {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const quoted = trimmed.match(/^"(.+)"$/)
  return quoted ? quoted[1] : trimmed
}

function versionHeaders(pick) {
  if (!pick?.version) return undefined
  return { ETag: `"${pick.version}"` }
}

function isPickConflictError(err) {
  return Boolean(
    err &&
      typeof err === "object" &&
      err.name === "PickConflictError" &&
      err.currentPick,
  )
}

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
    const baseVersion = normalizeIfMatch(req.headers.get("if-match"))
    if (baseVersion) {
      input = { ...input, baseVersion }
    }
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
    return Response.json({ pick }, { headers: versionHeaders(pick) })
  } catch (err) {
    if (isPickConflictError(err)) {
      return Response.json(
        { error: err.message, currentPick: err.currentPick },
        { status: 409, headers: versionHeaders(err.currentPick) },
      )
    }

    return sanitizedErrorResponse(err, {
      domainErrors: PICK_SAVE_DOMAIN_ERRORS,
      fallbackMessage: "Failed to save pick",
      logger,
      logMessage: "Failed to save pick",
    })
  }
}
