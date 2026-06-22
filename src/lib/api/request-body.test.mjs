import test from "node:test"
import assert from "node:assert/strict"

import { readJsonObjectBody } from "./request-body.js"

function requestWithBody(body) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body,
  })
}

test("readJsonObjectBody returns parsed object bodies", async () => {
  const result = await readJsonObjectBody(requestWithBody(JSON.stringify({ ok: true })))

  assert.equal(result.ok, true)
  assert.deepEqual(result.body, { ok: true })
})

test("readJsonObjectBody rejects malformed JSON", async () => {
  const result = await readJsonObjectBody(requestWithBody("{"))

  assert.equal(result.ok, false)
  assert.equal(result.response.status, 400)
  assert.deepEqual(await result.response.json(), { error: "Invalid JSON body" })
})

test("readJsonObjectBody rejects JSON null and arrays", async () => {
  for (const body of ["null", "[]"]) {
    const result = await readJsonObjectBody(requestWithBody(body), {
      nonObjectMessage: "body must be an object",
    })

    assert.equal(result.ok, false)
    assert.equal(result.response.status, 400)
    assert.deepEqual(await result.response.json(), { error: "body must be an object" })
  }
})

test("readJsonObjectBody supports optional empty object bodies", async () => {
  const result = await readJsonObjectBody(requestWithBody(""), { allowEmpty: true })

  assert.equal(result.ok, true)
  assert.deepEqual(result.body, {})
})
