import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./UserAvatarMenu.tsx", import.meta.url), "utf8")

test("UserAvatarMenu initials skip blank display-name candidates", () => {
  assert.match(source, /const candidates = \[user\.name, user\.email, user\.publicUsername\]/)
  assert.match(source, /\.map\(\(value\) => value\?\.trim\(\)\)/)
  assert.match(source, /\.find\(\(value\): value is string => Boolean\(value\)\) \?\? ["']\?["']/)
  assert.doesNotMatch(source, /user\.name \?\? user\.email/)
})
