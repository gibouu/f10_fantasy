const DEFAULT_INVALID_JSON_MESSAGE = "Invalid JSON body"
const DEFAULT_NON_OBJECT_MESSAGE = "Request body must be a JSON object"

export function isJsonObjectBody(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export async function readJsonObjectBody(request, options = {}) {
  const {
    allowEmpty = false,
    invalidJsonMessage = DEFAULT_INVALID_JSON_MESSAGE,
    nonObjectMessage = DEFAULT_NON_OBJECT_MESSAGE,
  } = options

  const rawBody = await request.text()
  if (rawBody.trim().length === 0) {
    if (allowEmpty) {
      return { ok: true, body: {} }
    }

    return bodyError(invalidJsonMessage)
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return bodyError(invalidJsonMessage)
  }

  if (!isJsonObjectBody(body)) {
    return bodyError(nonObjectMessage)
  }

  return { ok: true, body }
}

function bodyError(message) {
  return {
    ok: false,
    response: Response.json({ error: message }, { status: 400 }),
  }
}
