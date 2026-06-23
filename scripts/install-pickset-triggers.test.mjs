import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./install-pickset-triggers.ts", import.meta.url),
  "utf8",
)

test("trigger installer loads env files before reading DB URLs", () => {
  assert.match(source, /import \{ config as loadDotenv \} from ['"]dotenv['"]/)
  assert.match(source, /loadDotenv\(\{ path: ['"]\.env\.local['"] \}\)/)
  assert.match(source, /loadDotenv\(\{ path: ['"]\.env['"] \}\)/)

  const localDotenvIndex = source.indexOf("loadDotenv({ path: '.env.local' })")
  const dotenvIndex = source.indexOf("loadDotenv({ path: '.env' })")
  const directUrlIndex = source.indexOf("const directUrl =")
  assert.ok(localDotenvIndex >= 0, "expected installer to load .env.local")
  assert.ok(dotenvIndex >= 0, "expected installer to load .env")
  assert.ok(directUrlIndex >= 0, "expected installer to read directUrl")
  assert.ok(
    localDotenvIndex < directUrlIndex,
    ".env.local must load before DIRECT_URL/DATABASE_URL are read",
  )
  assert.ok(
    dotenvIndex < directUrlIndex,
    ".env must load before DIRECT_URL/DATABASE_URL are read",
  )
})
