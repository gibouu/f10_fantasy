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
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { encode } from 'next-auth/jwt'
import { db } from '@/lib/db/client'
import { MOBILE_JWT_SALT } from '@/lib/auth/mobileAuth'

const MOBILE_TOKEN_MAX_AGE = 60 * 60 * 8 // 8 hours — same as web session

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
        email_verified: payload.email_verified as boolean | undefined,
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
        email_verified: payload.email_verified as boolean | undefined,
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
): Promise<{
  id: string
  name: string | null
  email: string
  image: string | null
  publicUsername: string | null
  usernameSet: boolean
}> {
  const providerAccountId = claims.sub

  // 1. Look up existing Account link
  const existingAccount = await db.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          publicUsername: true,
          usernameSet: true,
        },
      },
    },
  })

  if (existingAccount) {
    return existingAccount.user
  }

  // 2. No Account found — check if a User with this email already exists
  const email = claims.email
  const existingUser = email
    ? await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          publicUsername: true,
          usernameSet: true,
        },
      })
    : null

  if (existingUser) {
    // Link the new provider account to the existing user
    await db.account.create({
      data: {
        userId: existingUser.id,
        type: 'oauth',
        provider,
        providerAccountId,
      },
    })
    return existingUser
  }

  // 3. Brand new user — create User + Account atomically
  const newUser = await db.user.create({
    data: {
      email: email || `${provider}.${providerAccountId}@placeholder.fxracing`,
      name: claims.name ?? null,
      image: claims.picture ?? null,
      emailVerified: claims.email_verified ? new Date() : null,
      accounts: {
        create: {
          type: 'oauth',
          provider,
          providerAccountId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      publicUsername: true,
      usernameSet: true,
    },
  })

  return newUser
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

  // Issue a mobile JWT using the same AUTH_SECRET as NextAuth, with a
  // distinct salt so mobile tokens are separate from web session cookies.
  const accessToken = await encode({
    token: {
      id: user.id,
      name: user.name ?? undefined,
      email: user.email,
      picture: user.image ?? undefined,
      publicUsername: user.publicUsername,
      usernameSet: user.usernameSet,
    },
    secret: process.env.AUTH_SECRET!,
    salt: MOBILE_JWT_SALT,
    maxAge: MOBILE_TOKEN_MAX_AGE,
  })

  return NextResponse.json({
    accessToken,
    userId: user.id,
    usernameSet: user.usernameSet,
    publicUsername: user.publicUsername,
  })
}
