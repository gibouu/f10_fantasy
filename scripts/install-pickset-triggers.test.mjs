import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./install-pickset-triggers.ts", import.meta.url),
  "utf8",
)
const smokeSource = await readFile(
  new URL("./test-pickset-trigger.ts", import.meta.url),
  "utf8",
)

function assertLoadsEnvBeforeDbUrl(source, scriptName) {
  assert.match(source, /import \{ config as loadDotenv \} from ['"]dotenv['"]/)
  assert.match(source, /loadDotenv\(\{ path: ['"]\.env\.local['"] \}\)/)
  assert.match(source, /loadDotenv\(\{ path: ['"]\.env['"] \}\)/)

  const localDotenvIndex = source.indexOf("loadDotenv({ path: '.env.local' })")
  const dotenvIndex = source.indexOf("loadDotenv({ path: '.env' })")
  const directUrlIndex = source.indexOf("const directUrl =")
  assert.ok(localDotenvIndex >= 0, `expected ${scriptName} to load .env.local`)
  assert.ok(dotenvIndex >= 0, `expected ${scriptName} to load .env`)
  assert.ok(directUrlIndex >= 0, `expected ${scriptName} to read directUrl`)
  assert.ok(
    localDotenvIndex < directUrlIndex,
    `${scriptName} must load .env.local before DIRECT_URL/DATABASE_URL are read`,
  )
  assert.ok(
    dotenvIndex < directUrlIndex,
    `${scriptName} must load .env before DIRECT_URL/DATABASE_URL are read`,
  )
}

test("trigger installer loads env files before reading DB URLs", () => {
  assertLoadsEnvBeforeDbUrl(source, "trigger installer")
})

test("trigger smoke test loads env files before reading DB URLs", () => {
  assertLoadsEnvBeforeDbUrl(smokeSource, "trigger smoke test")
})
