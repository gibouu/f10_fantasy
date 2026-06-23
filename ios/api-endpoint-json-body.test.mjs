import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Core/Networking/APIEndpoint.swift", import.meta.url),
  "utf8",
)

test("APIEndpoint centralizes JSON body encoding", () => {
  assert.match(
    source,
    /private static func jsonBody<T:\s*Encodable>\(_ value:\s*T\) -> Data\?/,
    "APIEndpoint should provide one helper for optional JSON request bodies",
  )
  assert.equal(
    (source.match(/JSONEncoder\(\)\.encode/g) ?? []).length,
    1,
    "endpoint factories should not each instantiate JSONEncoder",
  )
})

test("JSON-body endpoints use the shared helper", () => {
  for (const factory of [
    "mobileExchange",
    "setUsername",
    "changeUsername",
    "setFavoriteTeam",
    "submitPick",
    "sendFriendRequest",
    "respondToFriendRequest",
  ]) {
    const block = source.match(new RegExp(`static func ${factory}[\\s\\S]*?\\n    \\}`))?.[0]
    assert.ok(block, `${factory} endpoint factory should exist`)
    assert.match(block, /bodyData:\s*jsonBody\(/, `${factory} should use jsonBody(...)`)
    assert.doesNotMatch(block, /let body = try\? JSONEncoder\(\)\.encode/)
  }
})
