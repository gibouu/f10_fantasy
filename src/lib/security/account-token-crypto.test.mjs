import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import vm from "node:vm"
import * as ts from "typescript"

const source = await readFile(
  new URL("./account-token-crypto.ts", import.meta.url),
  "utf8",
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
})

const transpiledModule = { exports: {} }
const exports = transpiledModule.exports
const require = createRequire(import.meta.url)

vm.runInNewContext(outputText, {
  Buffer,
  console,
  exports,
  module: transpiledModule,
  process,
  require,
})

const {
  decryptTokenValue,
  encryptTokenValue,
  isEncryptedTokenValue,
} = transpiledModule.exports

function withTokenSecret(fn) {
  const previousAuthSecret = process.env.AUTH_SECRET
  const previousEncryptionKey = process.env.ACCOUNT_TOKEN_ENCRYPTION_KEY

  process.env.AUTH_SECRET = "test-auth-secret"
  delete process.env.ACCOUNT_TOKEN_ENCRYPTION_KEY

  try {
    fn()
  } finally {
    if (previousAuthSecret === undefined) {
      delete process.env.AUTH_SECRET
    } else {
      process.env.AUTH_SECRET = previousAuthSecret
    }

    if (previousEncryptionKey === undefined) {
      delete process.env.ACCOUNT_TOKEN_ENCRYPTION_KEY
    } else {
      process.env.ACCOUNT_TOKEN_ENCRYPTION_KEY = previousEncryptionKey
    }
  }
}

function silenceWarnings(fn) {
  const previousWarn = console.warn
  console.warn = () => undefined

  try {
    fn()
  } finally {
    console.warn = previousWarn
  }
}

test("encrypted account tokens round-trip with the current prefix format", () => {
  withTokenSecret(() => {
    const encrypted = encryptTokenValue("oauth-token-value")

    assert.match(encrypted, /^enc:v1:/)
    assert.equal(encrypted.split(":").length, 5)
    assert.equal(isEncryptedTokenValue(encrypted), true)
    assert.notEqual(encrypted, "oauth-token-value")
    assert.equal(decryptTokenValue(encrypted), "oauth-token-value")
  })
})

test("encrypted account tokens are not encrypted twice", () => {
  withTokenSecret(() => {
    const encrypted = encryptTokenValue("oauth-token-value")

    assert.equal(encryptTokenValue(encrypted), encrypted)
  })
})

test("malformed encrypted account tokens return the raw value", () => {
  withTokenSecret(() => {
    silenceWarnings(() => {
      const malformed = "enc:v1:missing-fields"

      assert.equal(decryptTokenValue(malformed), malformed)
    })
  })
})
