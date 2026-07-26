import type { RaceSummary } from "@/types/domain"

export const PUBLIC_RACES_TAG = "public-races"

export function publicRaceTag(raceId: string): string {
  return `public-race:${raceId}`
}

export function raceListCacheControl(): string {
  return "public, s-maxage=60, stale-while-revalidate=300"
}

export function raceDetailCacheControl(status: RaceSummary["status"]): string {
  switch (status) {
    case "COMPLETED":
    case "CANCELLED":
      return "public, s-maxage=3600, stale-while-revalidate=86400"
    case "LIVE":
      return "public, s-maxage=15, stale-while-revalidate=30"
    case "UPCOMING":
      return "public, s-maxage=60, stale-while-revalidate=300"
  }

  return "public, s-maxage=60, stale-while-revalidate=300"
}

export function raceNotFoundCacheControl(): string {
  return "public, s-maxage=30, stale-while-revalidate=60"
}

export function publicRaceCacheTagHeader(raceId?: string): string {
  return raceId ? `${PUBLIC_RACES_TAG}, ${publicRaceTag(raceId)}` : PUBLIC_RACES_TAG
}

/**
 * Tags whose cached responses a cron run has just made stale, for logging.
 *
 * Public race caching is TTL-only (see `raceDetailCacheControl`), so nothing
 * purges automatically. Logging the tags means an operator reading cron output
 * knows exactly what to pass to `vercel cache invalidate --tag` if they need
 * the change visible before the TTL expires.
 */
export function stalePublicRaceCacheTags(raceIds: Iterable<string>): string {
  const ids = Array.from(new Set(raceIds))
  if (ids.length === 0) return ""
  return [PUBLIC_RACES_TAG, ...ids.map(publicRaceTag)].join(",")
}

export function serverTiming(
  entries: Array<{ name: string; durationMs?: number; description?: string }>,
): string {
  return entries
    .map(({ name, durationMs, description }) => {
      const parts = [name]
      if (description) parts.push(`desc="${description}"`)
      if (durationMs !== undefined) {
        parts.push(`dur=${Math.max(0, durationMs).toFixed(1)}`)
      }
      return parts.join(";")
    })
    .join(", ")
}

export function publicRaceHeaders({
  cacheControl,
  raceId,
  serverTiming: timing,
}: {
  cacheControl: string
  raceId?: string
  serverTiming: string
}): HeadersInit {
  return {
    "Cache-Control": cacheControl,
    // Vercel reads `Vercel-Cache-Tag`; a bare `Cache-Tag` is the Cloudflare/
    // Fastly convention and is ignored here. Tagging makes these responses
    // purgeable on demand:
    //   vercel cache invalidate --tag public-race:<raceId>
    // or POST /v1/edge-cache/invalidate-by-tags.
    "Vercel-Cache-Tag": publicRaceCacheTagHeader(raceId),
    "Server-Timing": timing,
  }
}
