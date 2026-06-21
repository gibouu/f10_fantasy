import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./FXRacing/Features/Auth/SignInViewModel.swift", import.meta.url),
  "utf8",
)

test("SignInViewModel ignores duplicate Apple completions while loading", () => {
  assert.match(source, /guard !isLoading else \{\s*return\s*\}/)
  assert.ok(
    source.indexOf("guard !isLoading else") < source.indexOf("switch result"),
  )
})
