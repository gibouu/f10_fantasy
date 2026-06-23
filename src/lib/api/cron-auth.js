const BEARER_PREFIX = "Bearer "

export function validateCronSecret(
  request,
  getCronSecret = () => process.env.CRON_SECRET,
) {
  const secret = getCronSecret()
  if (!secret) return false

  const authorization = request.headers.get("authorization")
  const provided = authorization?.startsWith(BEARER_PREFIX)
    ? authorization.slice(BEARER_PREFIX.length)
    : null

  return provided === secret
}
