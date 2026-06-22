import test from "node:test"
import assert from "node:assert/strict"

import {
  authedDeps,
  authSession,
  jsonRequest,
  rawRequest,
  responseJson,
  unauthenticatedDeps,
} from "./test-utils.mjs"

test("jsonRequest builds JSON requests with overridable method and headers", async () => {
  const request = jsonRequest("http://localhost/api/test", { ok: true }, {
    method: "PATCH",
    headers: { authorization: "Bearer token" },
  })

  assert.equal(request.method, "PATCH")
  assert.equal(request.headers.get("content-type"), "application/json")
  assert.equal(request.headers.get("authorization"), "Bearer token")
  assert.deepEqual(await request.json(), { ok: true })
})

test("rawRequest leaves the request body unparsed for malformed JSON checks", async () => {
  const request = rawRequest("http://localhost/api/test", "{", { method: "POST" })

  assert.equal(request.method, "POST")
  assert.equal(await request.text(), "{")
})

test("auth helpers provide cookie and anonymous dependency defaults", async () => {
  assert.deepEqual(authSession("user-123"), { user: { id: "user-123" } })
  assert.deepEqual(await authedDeps("user-123").auth(), authSession("user-123"))
  assert.equal(await authedDeps("user-123").mobileAuth(), null)
  assert.equal(await unauthenticatedDeps().auth(), null)
  assert.equal(await unauthenticatedDeps().mobileAuth(), null)
})

test("responseJson reads response bodies once in route assertions", async () => {
  const response = Response.json({ ok: true })

  assert.deepEqual(await responseJson(response), { ok: true })
})
