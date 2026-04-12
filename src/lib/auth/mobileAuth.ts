/**
 * mobileAuth — Bearer token authentication for native iOS clients.
 *
 * Web requests are authenticated via Auth.js session cookies (auth() from @/auth).
 * Native iOS clients cannot use HTTP-only cookies, so they send a custom JWT
 * issued by POST /api/auth/mobile/exchange as `Authorization: Bearer <token>`.
 *
 * This helper reads that header, decodes the JWT using the same AUTH_SECRET
 * and salt ("mobile") as the exchange endpoint, applies the same
 * sessionValidAfter revocation check as auth.ts, and returns a Session
 * object in the identical shape that auth() produces.
 *
 * Usage in route handlers:
 *   const session = await auth() ?? await mobileAuth(req)
 */

import { decode } from 'next-auth/jwt'
import { db } from '@/lib/db/client'
import type { Session } from 'next-auth'

export const MOBILE_JWT_SALT = 'mobile'

export async function mobileAuth(req: Request): Promise<Session | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const bearer = authHeader.slice(7).trim()
  if (!bearer) return null

  try {
    const token = await decode({
      token: bearer,
      secret: process.env.AUTH_SECRET!,
      salt: MOBILE_JWT_SALT,
    })

    if (!token?.id) return null

    // Apply the same revocation check that auth.ts applies for cookie sessions.
    const user = await db.user.findUnique({
      where: { id: token.id as string },
      select: { sessionValidAfter: true },
    })

    const sessionIssuedAtMs =
      typeof token.iat === 'number' ? token.iat * 1000 : null

    if (
      user?.sessionValidAfter &&
      sessionIssuedAtMs !== null &&
      sessionIssuedAtMs < user.sessionValidAfter.getTime()
    ) {
      return null // Token has been revoked via POST /api/auth/revoke-session
    }

    return {
      user: {
        id: token.id as string,
        name: (token.name as string | null) ?? null,
        email: (token.email as string | null) ?? null,
        image: (token.picture as string | null) ?? null,
        publicUsername: (token.publicUsername as string | null) ?? null,
        usernameSet: Boolean(token.usernameSet),
        sessionIssuedAtMs,
      },
      expires: new Date(
        ((token.exp as number) ?? 0) * 1000,
      ).toISOString(),
    } as Session
  } catch {
    return null
  }
}
