const MOBILE_BEARER_API_PATHS = new Set([
  "/api/account",
  "/api/friends",
  "/api/leaderboard",
  "/api/picks",
  "/api/users/me",
  "/api/users/team",
  "/api/users/tutorial",
  "/api/users/username",
])

const MOBILE_BEARER_API_PREFIXES = ["/api/friends/"]

const SECRET_BEARER_API_PATHS = new Set(["/api/diag/health"])
const SECRET_BEARER_API_PREFIXES = ["/api/diag/race/"]

export function isBearerAuthApiRoute(pathname: string, _method: string): boolean {
  return (
    MOBILE_BEARER_API_PATHS.has(pathname) ||
    MOBILE_BEARER_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    SECRET_BEARER_API_PATHS.has(pathname) ||
    SECRET_BEARER_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}
