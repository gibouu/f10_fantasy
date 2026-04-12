/**
 * mobileAuth — Bearer token authentication for native iOS clients.
 *
 * Web requests are authenticated via Auth.js session cookies (auth() from @/auth).
 * Native iOS clients cannot use HTTP-only cookies, so they send a custom JWT
 * issued by POST /api/auth/mobile/exchange as `Authorization: Bearer <token>`.
 *
 * The mobile JWT is a plain HS256-signed JWT (not a JWE) created with jose
 * directly, keyed from AUTH_SECRET. This avoids next-auth's internal JWE
 * key-derivation which caused "Decryption failed (key mismatch?)" errors.
 *
 * Usage in route handlers:
 *   const session = await auth() ?? await mobileAuth(req)
 */

import { jwtVerify } from 'jose'
import { db } from '@/lib/db/client'
import type { Session } from 'next-auth'

/** Derive a stable signing key from AUTH_SECRET for mobile JWTs. */
export function mobileSigningKey(): Uint8Array {
  return Buffer.from(process.env.AUTH_SECRET!, 'utf-8')
}

export async function mobileAuth(req: Request): Promise<Session | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const bearer = authHeader.slice(7).trim()
  if (!bearer) return null

  let payload: Record<string, unknown>
  try {
    const { payload: verified } = await jwtVerify(bearer, mobileSigningKey(), {
      algorithms: ['HS256'],
    })
    payload = verified as Record<string, unknown>
  } catch (e) {
    console.error('[mobileAuth] jwtVerify failed:', e)
    return null
  }

  const userId = (payload.id ?? payload.sub) as string | undefined
  console.log('[mobileAuth] token keys:', Object.keys(payload), 'userId:', userId)
  if (!userId) return null

  const sessionIssuedAtMs =
    typeof payload.iat === 'number' ? payload.iat * 1000 : null

  // Apply revocation check — if the DB is unavailable, allow the session
  // rather than locking out all mobile users during a transient outage.
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { sessionValidAfter: true },
    })

    if (
      user?.sessionValidAfter &&
      sessionIssuedAtMs !== null &&
      sessionIssuedAtMs < user.sessionValidAfter.getTime()
    ) {
      return null // Token has been revoked via POST /api/auth/revoke-session
    }
  } catch {
    // DB unavailable — skip revocation check, proceed with token claims
  }

  return {
    user: {
      id: userId,
      name: (payload.name as string | null) ?? null,
      email: (payload.email as string | null) ?? null,
      image: (payload.picture as string | null) ?? null,
      publicUsername: (payload.publicUsername as string | null) ?? null,
      usernameSet: Boolean(payload.usernameSet),
      sessionIssuedAtMs,
    },
    expires: new Date(
      ((payload.exp as number) ?? 0) * 1000,
    ).toISOString(),
  } as Session
}
