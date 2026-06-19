import test from "node:test"
import assert from "node:assert/strict"

import { nextSessionRevocationCutoff } from "./session-cutoff.js"

test("nextSessionRevocationCutoff stores the next whole-second cutoff", () => {
  assert.equal(
    nextSessionRevocationCutoff(new Date("2026-06-19T12:00:00.000Z")).toISOString(),
    "2026-06-19T12:00:01.000Z",
  )
  assert.equal(
    nextSessionRevocationCutoff(new Date("2026-06-19T12:00:00.999Z")).toISOString(),
    "2026-06-19T12:00:01.000Z",
  )
})
