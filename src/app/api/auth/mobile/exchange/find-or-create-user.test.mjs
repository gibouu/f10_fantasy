import test from "node:test"
import assert from "node:assert/strict"

import { findOrCreateMobileUser } from "./find-or-create-user.js"

class KnownRequestError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const Prisma = {
  PrismaClientKnownRequestError: KnownRequestError,
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  publicUsername: true,
  usernameSet: true,
}

function claims(overrides = {}) {
  return {
    sub: "provider-user-1",
    email: "driver@example.com",
    email_verified: true,
    name: "Test Driver",
    picture: "https://example.com/driver.png",
    ...overrides,
  }
}

test("findOrCreateMobileUser returns the account created by a concurrent first exchange", async () => {
  const racedUser = { id: "raced-user", email: "driver@example.com" }
  const accountLookups = []
  const db = {
    account: {
      findUnique: async (query) => {
        accountLookups.push(query)
        return accountLookups.length === 1
          ? null
          : { user: racedUser }
      },
      upsert: async () => {
        throw new Error("upsert should not run after raced account is found")
      },
    },
    user: {
      findUnique: async () => null,
      create: async () => {
        throw new KnownRequestError("P2002")
      },
    },
  }

  const user = await findOrCreateMobileUser({
    provider: "apple",
    claims: claims(),
    db,
    Prisma,
    userSelect,
    verifiedProviderEmail: () => "driver@example.com",
  })

  assert.equal(user, racedUser)
  assert.equal(accountLookups.length, 2)
})

test("findOrCreateMobileUser links a concurrently-created email user after create loses the race", async () => {
  const racedUser = { id: "email-user", email: "driver@example.com" }
  const linkedUser = { id: "email-user", email: "driver@example.com", linked: true }
  const userLookups = []
  const upserts = []
  const db = {
    account: {
      findUnique: async () => null,
      upsert: async (query) => {
        upserts.push(query)
        return { user: linkedUser }
      },
    },
    user: {
      findUnique: async () => {
        userLookups.push("findUnique")
        return userLookups.length === 1 ? null : racedUser
      },
      create: async () => {
        throw new KnownRequestError("P2002")
      },
    },
  }

  const user = await findOrCreateMobileUser({
    provider: "google",
    claims: claims({ sub: "google-user-1" }),
    db,
    Prisma,
    userSelect,
    verifiedProviderEmail: () => "driver@example.com",
  })

  assert.equal(user, linkedUser)
  assert.equal(upserts.length, 1)
  assert.deepEqual(upserts[0].create, {
    userId: "email-user",
    type: "oauth",
    provider: "google",
    providerAccountId: "google-user-1",
  })
})
