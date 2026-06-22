export function shouldRefreshForSessionStatus(previousStatus, status) {
  return previousStatus !== "authenticated" && status === "authenticated"
}
