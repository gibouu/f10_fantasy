import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const middlewareSource = await readFile(new URL("./middleware.ts", import.meta.url), "utf8")
const leaderboardHandlerSource = await readFile(
  new URL("./app/api/leaderboard/get-handler.js", import.meta.url),
  "utf8",
)

// Regression: production redirected guest GET /api/leaderboard to /signin, so
// the native Rankings tab decoded an HTML sign-in page as JSON and surfaced
// "the data couldn't be read because it isn't in the correct format".
test("guest leaderboard GETs are public in middleware", () => {
  const publicApiRoute = middlewareSource.slice(
    middlewareSource.indexOf("function isPublicApiRoute"),
    middlewareSource.indexOf("const authMiddleware"),
  )

  assert.match(publicApiRoute, /"\/api\/leaderboard"/)
  assert.match(publicApiRoute, /method === "GET"/)
})

test("the leaderboard handler still resolves a session and guards friends scope", () => {
  // Making the route public in middleware must not remove the handler's own
  // auth resolution — signed-in rank/highlighting depends on it.
  assert.match(leaderboardHandlerSource, /await auth\(\)\) \?\? \(await mobileAuth\(request\)/)
  assert.match(leaderboardHandlerSource, /const userId = session\?\.user\?\.id \?\? null/)
  assert.match(
    leaderboardHandlerSource,
    /if \(scope === "friends" && !userId\) \{[\s\S]*?status: 401/,
  )
})
