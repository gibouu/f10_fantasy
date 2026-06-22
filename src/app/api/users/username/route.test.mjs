import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("PATCH validates parsed username body before destructuring", () => {
  assert.match(source, /readJsonObjectBody\(req, \{/)
  assert.match(source, /nonObjectMessage: "username must be a non-empty string"/)
  assert.match(source, /const \{ username \} = parsedBody\.body/)
})
