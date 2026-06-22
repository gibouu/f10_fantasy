const MAX_TEXT_LENGTH = 500
const MAX_PATH_LENGTH = 200
const MAX_DIGEST_LENGTH = 120
const VALID_KINDS = new Set(["boundary", "error", "unhandledrejection"])

const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const JWT_PATTERN =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const SECRET_ASSIGNMENT_PATTERN =
  /\b(access_token|api[_-]?key|id_token|password|refresh_token|secret|token)=([^&\s]+)/gi

function stringifyText(value) {
  if (typeof value === "string") {
    return value
  }

  if (value instanceof Error) {
    return value.message
  }

  try {
    const json = JSON.stringify(value)
    return json ?? String(value ?? "")
  } catch {
    return String(value ?? "")
  }
}

function limitText(value, maxLength) {
  return value.slice(0, maxLength)
}

function sanitizePath(value) {
  if (typeof value !== "string") {
    return "unknown"
  }

  const trimmed = value.trim()
  if (!trimmed.startsWith("/")) {
    return "unknown"
  }

  const path = trimmed.split(/[?#]/, 1)[0] || "/"
  if (!path.startsWith("/") || /\s/.test(path)) {
    return "unknown"
  }

  return limitText(path, MAX_PATH_LENGTH)
}

function redactClientErrorText(value) {
  return limitText(
    stringifyText(value)
      .replace(BEARER_TOKEN_PATTERN, "Bearer [redacted-token]")
      .replace(JWT_PATTERN, "[redacted-jwt]")
      .replace(EMAIL_PATTERN, "[redacted-email]")
      .replace(UUID_PATTERN, "[redacted-id]")
      .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[redacted-secret]"),
    MAX_TEXT_LENGTH,
  )
}

function sanitizeClientErrorPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null
  }

  const message = redactClientErrorText(body.message).trim()
  if (!message) {
    return null
  }

  const kind = VALID_KINDS.has(body.kind) ? body.kind : "error"
  const event = {
    kind,
    message,
    path: sanitizePath(body.path),
  }

  const digest = redactClientErrorText(body.digest).trim()
  if (digest) {
    event.digest = limitText(digest, MAX_DIGEST_LENGTH)
  }

  return event
}

exports.redactClientErrorText = redactClientErrorText
exports.sanitizeClientErrorPayload = sanitizeClientErrorPayload
