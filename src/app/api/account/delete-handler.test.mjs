import assert from 'node:assert/strict'
import test from 'node:test'

import { deleteAccountForSession } from './delete-handler.js'

function request() {
  return new Request('https://example.test/api/account', { method: 'DELETE' })
}

function deps(overrides = {}) {
  const calls = []
  return {
    calls,
    auth: async () => null,
    mobileAuth: async () => null,
    deleteUser: async (userId) => {
      calls.push(userId)
    },
    logger: { log() {}, error() {} },
    ...overrides,
  }
}

test('DELETE /api/account returns 401 when unauthenticated', async () => {
  const d = deps()
  const response = await deleteAccountForSession(request(), d)

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Unauthorized' })
  assert.deepEqual(d.calls, [])
})

test('DELETE /api/account deletes the cookie-authenticated user', async () => {
  const d = deps({
    auth: async () => ({ user: { id: 'web-user' } }),
  })

  const response = await deleteAccountForSession(request(), d)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(d.calls, ['web-user'])
})

test('DELETE /api/account falls back to mobile bearer auth', async () => {
  const d = deps({
    mobileAuth: async () => ({ user: { id: 'mobile-user' } }),
  })

  const response = await deleteAccountForSession(request(), d)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(d.calls, ['mobile-user'])
})

test('DELETE /api/account reports deletion failures without success', async () => {
  const d = deps({
    auth: async () => ({ user: { id: 'web-user' } }),
    deleteUser: async (userId) => {
      d.calls.push(userId)
      throw new Error('database unavailable')
    },
  })

  const response = await deleteAccountForSession(request(), d)

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Deletion failed' })
  assert.deepEqual(d.calls, ['web-user'])
})
