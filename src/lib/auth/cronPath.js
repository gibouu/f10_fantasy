const CRON_PREFIX = "/api/cron"

export function isCronRoutePath(pathname) {
  return pathname === CRON_PREFIX || pathname.startsWith(`${CRON_PREFIX}/`)
}
