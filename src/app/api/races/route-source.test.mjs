import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const listSource = await readFile(new URL("./route.ts", import.meta.url), "utf8")
const detailSource = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8")
const detailHandlerSource = await readFile(
  new URL("./[id]/get-handler.js", import.meta.url),
  "utf8",
)
const cacheSource = await readFile(
  new URL("../../../lib/api/public-race-cache.ts", import.meta.url),
  "utf8",
)
const middlewareSource = await readFile(
  new URL("../../../middleware.ts", import.meta.url),
  "utf8",
)
const syncScheduleSource = await readFile(
  new URL("../cron/sync-schedule/route.ts", import.meta.url),
  "utf8",
)
const syncEntriesSource = await readFile(
  new URL("../cron/sync-entries/route.ts", import.meta.url),
  "utf8",
)
const ingestResultsSource = await readFile(
  new URL("../cron/ingest-results/route.ts", import.meta.url),
  "utf8",
)
const lockPicksSource = await readFile(
  new URL("../cron/lock-picks/route.ts", import.meta.url),
  "utf8",
)

test("race detail route delegates HTTP behavior to the injected handler seam", () => {
  assert.match(detailSource, /import \{ createRaceDetailGetHandler \} from '\.\/get-handler'/)
  assert.match(detailSource, /export const GET = createRaceDetailGetHandler\(\{/)
})

test("race detail route wires season form and qualifying dependencies", () => {
  assert.match(detailSource, /import \{ getDriverSeasonStats \}/)
  assert.match(detailSource, /getQualifyingResults,/)
  assert.match(detailSource, /getResultScoreGuide,/)
  assert.match(detailSource, /findRaceResults,/)
})

test("race detail route injects the shared public race cache helpers", () => {
  assert.match(detailSource, /from '@\/lib\/api\/public-race-cache'/)
  assert.match(detailSource, /publicRaceHeaders,/)
  assert.match(detailSource, /raceDetailCacheControl,/)
  assert.match(detailSource, /raceNotFoundCacheControl,/)
  assert.match(detailSource, /serverTiming,/)
})

test("race detail API lets qualifying result lookup failures surface", () => {
  assert.match(detailHandlerSource, /getQualifyingResults\(params\.id\)/)
  assert.doesNotMatch(
    detailHandlerSource,
    /getQualifyingResults\(params\.id\)\.catch\(\(\) => \[\]\)/,
  )
})

test("race detail API enriches entrants with season form without serial data waterfalls", () => {
  assert.match(
    detailHandlerSource,
    /await Promise\.all\(\[\s*getRaceEntrants\(params\.id\),\s*getDriverSeasonStats\(\{/,
  )
  assert.match(detailHandlerSource, /seasonAverageFinish:/)
  assert.match(detailHandlerSource, /seasonDnfCount:/)
  assert.match(detailHandlerSource, /seasonResults:/)
  assert.match(detailHandlerSource, /entrants:\s*enrichedEntrants/)
})

test("public race list and detail responses use shared cache and timing headers", () => {
  assert.doesNotMatch(listSource, /force-dynamic/)
  assert.match(listSource, /raceListCacheControl\(\)/)
  assert.match(listSource, /publicRaceHeaders\(\{/)
  assert.match(listSource, /Server-Timing|serverTiming/)

  assert.match(detailHandlerSource, /raceDetailCacheControl\(race\.status\)/)
  assert.match(detailHandlerSource, /raceNotFoundCacheControl\(\)/)
  assert.match(detailHandlerSource, /publicRaceHeaders\(\{/)
  assert.match(detailHandlerSource, /serverTiming\(\[/)
})

test("public race cache TTLs are status appropriate", () => {
  assert.match(cacheSource, /raceListCacheControl\(\)[\s\S]*s-maxage=60/)
  assert.match(cacheSource, /case "COMPLETED":[\s\S]*case "CANCELLED":[\s\S]*s-maxage=3600/)
  assert.match(cacheSource, /case "LIVE":[\s\S]*s-maxage=15/)
  assert.match(cacheSource, /case "UPCOMING":[\s\S]*s-maxage=60/)
})

test("middleware bypasses Auth.js before public race GETs can set cookies", () => {
  assert.match(middlewareSource, /function isPublicRaceApiGet/)
  assert.match(
    middlewareSource,
    /if \(isPublicRaceApiGet\(pathname, req\.method\)\) \{\s*return NextResponse\.next\(\);\s*\}\s*return authMiddleware/,
  )
})

test("race-data cron mutations revalidate public race cache tags", () => {
  for (const source of [
    syncScheduleSource,
    syncEntriesSource,
    ingestResultsSource,
    lockPicksSource,
  ]) {
    assert.match(source, /revalidatePublicRaceCache/)
  }
  assert.match(cacheSource, /revalidateTag\(PUBLIC_RACES_TAG\)/)
  assert.match(cacheSource, /revalidateTag\(publicRaceTag\(raceId\)\)/)
})
