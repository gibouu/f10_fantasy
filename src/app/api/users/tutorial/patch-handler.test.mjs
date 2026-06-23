import test from "node:test"
import assert from "node:assert/strict"

import { handleTutorialPatch } from "./patch-handler.js"

function tutorialRequest(body) {
  return new Request("http://localhost/api/users/tutorial", {
    method: "PATCH",
    body,
  })
}

function dependencies(overrides = {}) {
  const calls = []
  return {
    calls,
    auth: async () => ({ user: { id: "user-1" } }),
    mobileAuth: async () => null,
    dismissTutorial: async (userId) => {
      calls.push(userId)
      return new Date("2026-06-23T00:00:00.000Z")
    },
    logger: { error() {} },
    ...overrides,
  }
}

test("PATCH rejects malformed tutorial JSON without dismissing", async () => {
  const deps = dependencies()
  const response = await handleTutorialPatch(tutorialRequest("{"), deps)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "Invalid JSON body" })
  assert.deepEqual(deps.calls, [])
})

test("PATCH preserves empty-body tutorial dismissal", async () => {
  const deps = dependencies()
  const response = await handleTutorialPatch(tutorialRequest(""), deps)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    tutorialDismissedAt: "2026-06-23T00:00:00.000Z",
  })
  assert.deepEqual(deps.calls, ["user-1"])
})

test("PATCH rejects explicit dismissed false without dismissing", async () => {
  const deps = dependencies()
  const response = await handleTutorialPatch(
    tutorialRequest(JSON.stringify({ dismissed: false })),
    deps,
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: "dismissed must be true" })
  assert.deepEqual(deps.calls, [])
})

test("PATCH sanitizes unexpected tutorial persistence failures", async () => {
  const logs = []
  const response = await handleTutorialPatch(
    tutorialRequest(JSON.stringify({ dismissed: true })),
    dependencies({
      dismissTutorial: async () => {
        throw new Error("database details leaked")
      },
      logger: { error: (...args) => logs.push(args) },
    }),
  )

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Failed to update tutorial state" })
  assert.equal(logs.length, 1)
  assert.equal(String(logs[0][1].message).includes("database details"), true)
})
