/**
 * One-time script to generate the APPLE_SECRET JWT for Auth.js Apple provider.
 *
 * Usage:
 *   node scripts/gen-apple-secret.mjs \
 *     --team-id  <TEAM_ID>   \
 *     --key-id   <KEY_ID>    \
 *     --key-file <path/to/AuthKey_XXXXXX.p8>
 *
 * The output is your APPLE_SECRET value — paste it into Vercel env vars.
 * Apple client secrets expire after 6 months max; re-run this script to rotate.
 */

import { createPrivateKey } from "crypto"
import { readFileSync } from "fs"
import { parseArgs } from "util"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "team-id":  { type: "string" },
    "key-id":   { type: "string" },
    "key-file": { type: "string" },
  },
})

const teamId   = values["team-id"]
const keyId    = values["key-id"]
const keyFile  = values["key-file"]

if (!teamId || !keyId || !keyFile) {
  console.error("Usage: node scripts/gen-apple-secret.mjs --team-id <T> --key-id <K> --key-file <path>")
  process.exit(1)
}

const CLIENT_ID = "com.fxracing.signin"
const AUDIENCE  = "https://appleid.apple.com"
// Apple allows max 6 months; use 180 days.
const EXPIRES_IN_SECONDS = 180 * 24 * 60 * 60

const privateKey = createPrivateKey(readFileSync(keyFile, "utf8"))

// Manual JWT construction — avoids needing jose/jsonwebtoken as a dep.
function base64url(input) {
  const buf = typeof input === "string" ? Buffer.from(input) : input
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

const header  = base64url(JSON.stringify({ alg: "ES256", kid: keyId }))
const now     = Math.floor(Date.now() / 1000)
const payload = base64url(JSON.stringify({
  iss: teamId,
  iat: now,
  exp: now + EXPIRES_IN_SECONDS,
  aud: AUDIENCE,
  sub: CLIENT_ID,
}))

const { createSign } = await import("crypto")
const signer = createSign("SHA256")
signer.update(`${header}.${payload}`)
const rawSig = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
const signature = base64url(rawSig)

const jwt = `${header}.${payload}.${signature}`

const expiresAt = new Date((now + EXPIRES_IN_SECONDS) * 1000).toISOString().slice(0, 10)

console.log("\n✅ APPLE_SECRET generated (expires ~" + expiresAt + "):\n")
console.log(jwt)
console.log("\nSet in Vercel:")
console.log(`  APPLE_ID     = ${CLIENT_ID}`)
console.log(`  APPLE_SECRET = <the JWT above>`)
console.log("\nRedirect URL to register in Apple Developer portal:")
console.log("  https://fxracing.ca/api/auth/callback/apple\n")
