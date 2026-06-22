import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./utils.ts", import.meta.url), "utf8")

test("team color helper returns a React-compatible color style object", () => {
  assert.match(source, /export function getTeamColorStyle\(hex: string\): \{ color: string \}/)
  assert.match(source, /return \{ color: normalized \}/)
  assert.doesNotMatch(source, /return `color: \$\{normalized\}`/)
  assert.doesNotMatch(source, /getTeamColorClass/)
})
