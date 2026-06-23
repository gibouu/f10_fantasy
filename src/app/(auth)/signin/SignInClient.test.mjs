import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./SignInClient.tsx", import.meta.url), "utf8")

test("sign-in legal disclaimer exposes real legal links", () => {
  assert.match(source, /import Link from "next\/link"/)
  assert.match(source, /<Link[\s\S]*href="\/privacy#terms"[\s\S]*>\s*Terms\s*<\/Link>/)
  assert.match(source, /<Link[\s\S]*href="\/privacy"[\s\S]*>\s*Privacy Policy\s*<\/Link>/)
})

test("sign-in legal disclaimer does not style inert spans as clickable", () => {
  assert.doesNotMatch(
    source,
    /<span className="underline underline-offset-2 cursor-pointer hover:text-text-secondary transition-colors">Terms<\/span>/,
  )
  assert.doesNotMatch(
    source,
    /<span className="underline underline-offset-2 cursor-pointer hover:text-text-secondary transition-colors">Privacy Policy<\/span>/,
  )
})
