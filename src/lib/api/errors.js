export function getErrorMessage(error, fallback = "Unknown error") {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return fallback
}

export function sanitizedErrorResponse(error, options = {}) {
  const {
    domainErrors = [],
    fallbackMessage = "Internal server error",
    fallbackStatus = 500,
    logger = console,
    logMessage = fallbackMessage,
  } = options

  const message = getErrorMessage(error)
  const domainError = domainErrors.find((rule) => matchesDomainError(rule, error, message))
  if (domainError) {
    return Response.json(
      { error: domainError.message ?? message },
      { status: domainError.status },
    )
  }

  logUnexpectedError(logger, logMessage, error)
  return Response.json({ error: fallbackMessage }, { status: fallbackStatus })
}

function matchesDomainError(rule, error, message) {
  if (typeof rule.when === "function" && rule.when(error, message)) {
    return true
  }

  if (rule.pattern instanceof RegExp && rule.pattern.test(message)) {
    return true
  }

  return false
}

function logUnexpectedError(logger, logMessage, error) {
  if (!logger) return

  if (typeof logger === "function") {
    logger(logMessage, error)
    return
  }

  if (typeof logger.error === "function") {
    logger.error(logMessage, error)
  }
}
