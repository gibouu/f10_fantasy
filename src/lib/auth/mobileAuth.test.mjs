import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { SignJWT, jwtVerify } from "jose"
import ts from "typescript"

const AUTH_SECRET = "test-mobile-auth-secret"
const mockDb = {
  user: {
    findUnique: async () => ({ sessionValidAfter: null }),
  },
}

globalThis.__mobileAuthTestDeps = { db: mockDb, jwtVerify }

async function loadMobileAuthModule() {
  const source = await readFile(new URL("./mobileAuth.ts", import.meta.url), "utf8")
  const prepared = source
    .replace(
      "import { jwtVerify } from 'jose'",
      "const { jwtVerify } = globalThis.__mobileAuthTestDeps",
    )
    .replace(
      "import { db } from '@/lib/db/client'",
      "const { db } = globalThis.__mobileAuthTestDeps",
    )
    .replace("import type { Session } from 'next-auth'\n", "")

  const { outputText } = ts.transpileModule(prepared, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const encoded = Buffer.from(outputText).toString("base64")
  return import(`data:text/javascript;base64,${encoded}`)
}

const { mobileAuth } = await loadMobileAuthModule()

function signingKey() {
  return Buffer.from(AUTH_SECRET, "utf8")
}

function bearerRequest(token) {
  return new Request("http://localhost/api/test", {
    headers: { authorization: `Bearer ${token}` },
  })
}

async function withAuthSecret(fn) {
  const previousSecret = process.env.AUTH_SECRET
  process.env.AUTH_SECRET = AUTH_SECRET

  try {
    return await fn()
  } finally {
    if (previousSecret === undefined) {
      delete process.env.AUTH_SECRET
    } else {
      process.env.AUTH_SECRET = previousSecret
    }
  }
}

async function silenceConsoleError(fn) {
  const previousError = console.error
  console.error = () => undefined

  try {
    return await fn()
  } finally {
    console.error = previousError
  }
}

test("mobileAuth rejects signed mobile tokens without exp", async () => {
  await withAuthSecret(async () => {
    let dbCalls = 0
    mockDb.user.findUnique = async () => {
      dbCalls++
      return { sessionValidAfter: null }
    }

    const token = await new SignJWT({ id: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(signingKey())

    assert.equal(await mobileAuth(bearerRequest(token)), null)
    assert.equal(dbCalls, 0)
  })
})

test("mobileAuth rejects expired mobile tokens before DB lookup", async () => {
  await withAuthSecret(async () => {
    let dbCalls = 0
    mockDb.user.findUnique = async () => {
      dbCalls++
      return { sessionValidAfter: null }
    }

    const token = await new SignJWT({ id: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signingKey())

    const session = await silenceConsoleError(() => mobileAuth(bearerRequest(token)))

    assert.equal(session, null)
    assert.equal(dbCalls, 0)
  })
})

test("mobileAuth accepts valid exp-bearing mobile tokens", async () => {
  await withAuthSecret(async () => {
    let dbCalls = 0
    mockDb.user.findUnique = async ({ where }) => {
      dbCalls++
      assert.deepEqual(where, { id: "user-1" })
      return { sessionValidAfter: null }
    }

    const exp = Math.floor(Date.now() / 1000) + 60 * 60
    const token = await new SignJWT({
      id: "user-1",
      name: "Driver One",
      email: "driver@example.com",
      publicUsername: "driverone",
      usernameSet: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(signingKey())

    const session = await mobileAuth(bearerRequest(token))

    assert.equal(dbCalls, 1)
    assert.equal(session?.user.id, "user-1")
    assert.equal(session?.user.publicUsername, "driverone")
    assert.equal(session?.user.usernameSet, true)
    assert.equal(session?.expires, new Date(exp * 1000).toISOString())
  })
})
