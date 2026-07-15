import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8")

test("support remains static and keeps the support address", () => {
  assert.doesNotMatch(page, /redirect\s*\(|["']use client["']/)
  assert.doesNotMatch(page, /@\/auth|@\/lib\/db|@\/lib\/services|fetch\s*\(|Providers/)
  assert.match(page, /href=["']mailto:support@fxracing\.ca["']/)
})

test("support owns its route metadata", () => {
  assert.match(page, /alternates:\s*{\s*canonical:\s*["']\/support["']\s*}/)
  assert.match(page, /openGraph:\s*{\s*url:\s*["']\/support["']\s*}/)
})
