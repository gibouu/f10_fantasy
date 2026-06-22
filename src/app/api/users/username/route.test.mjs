import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8")

test("PATCH validates parsed username body before destructuring", () => {
  assert.match(source, /if \(!body \|\| typeof body !== "object" \|\| Array\.isArray\(body\)\)/)
  assert.match(source, /const \{ username \} = body as \{ username\?: unknown \}/)
})
