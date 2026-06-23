import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8")

test("race detail API lets qualifying result lookup failures surface", () => {
  assert.match(source, /await getQualifyingResults\(params\.id\)/)
  assert.doesNotMatch(source, /getQualifyingResults\(params\.id\)\.catch\(\(\) => \[\]\)/)
})
