import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const [rootLayout, authLayout, mainLayout] = await Promise.all([
  readFile(new URL("../layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("./layout.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../(main)/layout.tsx", import.meta.url), "utf8"),
])

test("the landing root stays hydration-free while retired routes keep their provider", () => {
  assert.doesNotMatch(rootLayout, /Providers|SessionProvider/)

  for (const source of [authLayout, mainLayout]) {
    assert.match(source, /import\s+{\s*Providers\s*}\s+from\s+["']@\/components\/Providers["']/)
    assert.match(source, /<Providers>[\s\S]*?{children}[\s\S]*?<\/Providers>/)
  }
})
