/**
 * POST /api/auth/mobile/exchange
 *
 * Native iOS auth token exchange endpoint.
 *
 * The iOS app authenticates with Apple or Google natively (Sign In with Apple
 * SDK / Google Sign-In SDK), receives a provider id_token from the OS, then
 * sends it here. This endpoint:
 *   1. Verifies the id_token against the provider's JWKS
 *   2. Finds or creates the corresponding User + Account records in the DB
 *      (same behavior as the NextAuth OAuth adapter)
 *   3. Returns a signed JWE token that the iOS app stores in the Keychain
 *      and sends as `Authorization: Bearer <token>` on subsequent requests
 *
 * The token uses the same AUTH_SECRET as NextAuth but a distinct salt
 * ("mobile") so it is fully separate from web session cookies.
 *
 * Required env vars:
 *   AUTH_SECRET          — shared with NextAuth
 *   APPLE_ID             — Apple Service ID (web) — also accepted as iOS audience
 *   APPLE_BUNDLE_ID      — iOS app bundle ID (optional; also accepted if set)
 *   GOOGLE_CLIENT_ID     — Google web client ID
 *   GOOGLE_IOS_CLIENT_ID — Google iOS client ID (optional; also accepted if set)
 */

import { NextResponse } from 'next/server'
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { mobileSigningKey } from '@/lib/auth/mobileAuth'
import { verifiedProviderEmail } from '@/lib/auth/providerEmail'

// 60 days. Native iOS users expect to stay signed in across launches; the 8h
// expiry forced re-sign-in every day. Server-side revocation is still
// available via `User.sessionValidAfter` (POST /api/auth/revoke-session).
const MOBILE_TOKEN_MAX_AGE = 60 * 60 * 24 * 60

// ── Provider JWKS (cached by jose internally) ─────────────────────────────

const appleJWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
)

const googleJWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
)

// ── Provider verification ─────────────────────────────────────────────────

type ProviderClaims = {
  sub: string
  email: string
  email_verified?: boolean | string
  name?: string
  picture?: string
}

const mobileUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  publicUsername: true,
  usernameSet: true,
} as const

type MobileExchangeUser = Prisma.UserGetPayload<{ select: typeof mobileUserSelect }>

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

async function verifyAppleToken(idToken: string): Promise<ProviderClaims | null> {
  const validAudiences = [
    process.env.APPLE_ID,
    process.env.APPLE_BUNDLE_ID,
  ].filter(Boolean) as string[]

  if (validAudiences.length === 0) return null

  for (const audience of validAudiences) {
    try {
      const { payload } = await jwtVerify(idToken, appleJWKS, {
        issuer: 'https://appleid.apple.com',
        audience,
      })
      return {
        sub: payload.sub as string,
        email: (payload.email as string) ?? '',
        email_verified: payload.email_verified as boolean | string | undefined,
        name: (payload.name as string) ?? undefined,
      }
    } catch {
      // Try next audience
    }
  }
  return null
}

async function verifyGoogleToken(idToken: string): Promise<ProviderClaims | null> {
  const validAudiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter(Boolean) as string[]

  if (validAudiences.length === 0) return null

  for (const audience of validAudiences) {
    try {
      const { payload } = await jwtVerify(idToken, googleJWKS, {
        issuer: 'https://accounts.google.com',
        audience,
      })
      return {
        sub: payload.sub as string,
        email: (payload.email as string) ?? '',
        email_verified: payload.email_verified as boolean | string | undefined,
        name: (payload.name as string) ?? undefined,
        picture: (payload.picture as string) ?? undefined,
      }
    } catch {
      // Try next audience
    }
  }
  return null
}

// ── User find-or-create (mirrors NextAuth OAuth adapter behavior) ─────────

async function findOrCreateUser(
  provider: 'apple' | 'google',
  claims: ProviderClaims,
): Promise<MobileExchangeUser> {
  const providerAccountId = claims.sub
  const email = verifiedProviderEmail(claims)

  // 1. Look up existing Account link
  const existingAccount = await db.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: {
      user: {
        select: mobileUserSelect,
      },
    },
  })

  if (existingAccount) {
    return existingAccount.user
  }

  // 2. No Account found — check if a User with this verified email already exists
  const existingUser = email
    ? await db.user.findUnique({
        where: { email },
        select: mobileUserSelect,
      })
    : null

  if (existingUser) {
    // Link the new provider account to the existing user. Upsert makes a
    // concurrent first exchange for the same provider identity idempotent.
    const linkedAccount = await db.account.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      update: {},
      create: {
        userId: existingUser.id,
        type: 'oauth',
        provider,
        providerAccountId,
      },
      include: {
        user: {
          select: mobileUserSelect,
        },
      },
    })
    return linkedAccount.user
  }

  // 3. Brand new user — create User + Account atomically
  try {
    const newUser = await db.user.create({
      data: {
        email: email || `${provider}.${providerAccountId}@placeholder.fxracing`,
        name: claims.name ?? null,
        image: claims.picture ?? null,
        emailVerified: email ? new Date() : null,
        accounts: {
          create: {
            type: 'oauth',
            provider,
            providerAccountId,
          },
        },
      },
      select: mobileUserSelect,
    })

    return newUser
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      throw err
    }

    const racedAccount = await db.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: {
        user: {
          select: mobileUserSelect,
        },
      },
    })
    if (racedAccount) {
      return racedAccount.user
    }

    const racedUser = email
      ? await db.user.findUnique({
          where: { email },
          select: mobileUserSelect,
        })
      : null
    if (racedUser) {
      const linkedAccount = await db.account.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        update: {},
        create: {
          userId: racedUser.id,
          type: 'oauth',
          provider,
          providerAccountId,
        },
        include: {
          user: {
            select: mobileUserSelect,
          },
        },
      })
      return linkedAccount.user
    }

    throw err
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: { provider?: unknown; idToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const provider = body.provider
  const idToken = body.idToken

  if (provider !== 'apple' && provider !== 'google') {
    return NextResponse.json(
      { error: 'provider must be "apple" or "google"' },
      { status: 400 },
    )
  }

  if (typeof idToken !== 'string' || !idToken) {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 })
  }

  // Verify the id_token with the provider's JWKS
  const claims =
    provider === 'apple'
      ? await verifyAppleToken(idToken)
      : await verifyGoogleToken(idToken)

  if (!claims) {
    return NextResponse.json({ error: 'Invalid or expired id_token' }, { status: 401 })
  }

  // Find or create user (same behavior as NextAuth OAuth adapter)
  const user = await findOrCreateUser(provider, claims)

  // Issue a signed mobile JWT using jose directly (avoids next-auth JWE
  // key-derivation quirks that cause "Decryption failed" on decode).
  const accessToken = await new SignJWT({
    id: user.id,
    name: user.name ?? undefined,
    email: user.email,
    picture: user.image ?? undefined,
    publicUsername: user.publicUsername,
    usernameSet: user.usernameSet,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MOBILE_TOKEN_MAX_AGE}s`)
    .sign(mobileSigningKey())

  return NextResponse.json({
    accessToken,
    userId: user.id,
    usernameSet: user.usernameSet,
    publicUsername: user.publicUsername,
  })
}
