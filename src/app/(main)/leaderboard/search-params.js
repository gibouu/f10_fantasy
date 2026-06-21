/**
 * @param {string | string[] | undefined} value
 * @returns {string | undefined}
 */
function firstSearchParamValue(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined
  }

  return typeof value === "string" ? value : undefined
}

/**
 * @param {string | string[] | undefined} value
 * @param {boolean} hasUser
 * @returns {"global" | "friends"}
 */
export function normalizeLeaderboardScope(value, hasUser) {
  return hasUser && firstSearchParamValue(value) === "friends" ? "friends" : "global"
}

/**
 * @param {string | string[] | undefined} value
 * @param {string[]} completedRaceIds
 * @returns {string}
 */
export function normalizeLeaderboardSort(value, completedRaceIds) {
  const sort = firstSearchParamValue(value)
  if (sort === "season") return "season"
  return completedRaceIds.includes(sort) ? sort : "season"
}
