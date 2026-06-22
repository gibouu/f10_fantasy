import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")

test("README documents the expected Vercel CLI version", () => {
  assert.match(readme, /Vercel CLI 54\.14\.2 or newer/)
  assert.match(readme, /npm i -g vercel@latest/)
  assert.match(readme, /vercel --version/)
})
