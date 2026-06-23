import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const apiClient = await readFile(
  new URL("./FXRacing/Core/Networking/APIClient.swift", import.meta.url),
  "utf8",
)
const authManager = await readFile(
  new URL("./FXRacing/Core/Auth/AuthManager.swift", import.meta.url),
  "utf8",
)

const unauthorizedBlock = apiClient.match(/case 401:[\s\S]*?(?=\n        case \d|default:)/)?.[0]

test("APIClient normalizes every 401 response to unauthorized", () => {
  assert.ok(unauthorizedBlock, "APIClient should handle HTTP 401 explicitly")
  assert.match(
    unauthorizedBlock,
    /throw APIError\.unauthorized/,
    "401 handling should throw APIError.unauthorized",
  )
  assert.doesNotMatch(
    unauthorizedBlock,
    /throw APIError\.serverError\(401,/,
    "401 handling must not throw serverError(401, message)",
  )
})

test("restoreSession clears stored tokens when unauthorized", () => {
  const unauthorizedCatch = authManager.match(/catch APIError\.unauthorized \{[\s\S]*?\n        \}/)?.[0]

  assert.ok(unauthorizedCatch, "restoreSession should catch APIError.unauthorized")
  assert.match(unauthorizedCatch, /KeychainService\.deleteToken\(\)/)
  assert.match(unauthorizedCatch, /state = \.unauthenticated/)
  assert.ok(
    unauthorizedCatch.indexOf("KeychainService.deleteToken()") <
      unauthorizedCatch.indexOf("state = .unauthenticated"),
    "restoreSession should delete the stale token before entering guest state",
  )
})
