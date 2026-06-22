import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./LegalModal.tsx", import.meta.url), "utf8")

test("LegalModal uses Radix Dialog primitives for modal accessibility", () => {
  assert.match(source, /import \* as Dialog from '@radix-ui\/react-dialog'/)
  assert.match(source, /<Dialog\.Root\b/)
  assert.match(source, /<Dialog\.Trigger\b/)
  assert.match(source, /<Dialog\.Portal\b/)
  assert.match(source, /<Dialog\.Overlay\b/)
  assert.match(source, /<Dialog\.Content\b/)
  assert.match(source, /<Dialog\.Title\b[\s\S]*Legal &amp; Support[\s\S]*<\/Dialog\.Title>/)
  assert.match(source, /<Dialog\.Description\b/)
  assert.match(source, /<Dialog\.Close\b/)
  assert.doesNotMatch(source, /window\.addEventListener\('keydown'/)
  assert.doesNotMatch(source, /onClick=\{handleBackdrop\}/)
})
