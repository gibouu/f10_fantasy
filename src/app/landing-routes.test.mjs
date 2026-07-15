import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import nextConfig from "../../next.config.mjs"

const middlewareSource = await readFile(
  new URL("../middleware.ts", import.meta.url),
  "utf8",
)

const expectedRedirects = [
  { source: "/races", destination: "/", permanent: false },
  { source: "/races/:path*", destination: "/", permanent: false },
  { source: "/leaderboard", destination: "/", permanent: false },
  { source: "/picks", destination: "/", permanent: false },
  { source: "/profile", destination: "/", permanent: false },
  { source: "/profile/:path*", destination: "/", permanent: false },
  { source: "/signin", destination: "/", permanent: false },
  { source: "/onboarding/:path*", destination: "/", permanent: false },
]

function requireMatch(source, pattern, label) {
  const match = source.match(pattern)
  assert.ok(match, `Missing ${label}`)
  return match
}

function redirectSourceMatches(source, pathname) {
  const catchAllSuffix = "/:path*"

  if (source.endsWith(catchAllSuffix)) {
    const prefix = source.slice(0, -catchAllSuffix.length)
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  }

  return pathname === source
}

test("legacy browser routes redirect temporarily to landing", async () => {
  assert.equal(typeof nextConfig.redirects, "function")
  assert.deepEqual(await nextConfig.redirects(), expectedRedirects)
})

test("legacy redirects do not capture backend, legal, association, or native assets", () => {
  const preservedPaths = [
    "/api/races",
    "/privacy",
    "/support",
    "/.well-known/apple-app-site-association",
    "/drivers/hamilton.png",
    "/teamlogos/ferrari.webp",
  ]

  for (const pathname of preservedPaths) {
    for (const redirect of expectedRedirects) {
      assert.equal(
        redirectSourceMatches(redirect.source, pathname),
        false,
        `${redirect.source} must not match ${pathname}`,
      )
    }
  }
})

test("middleware matches only non-Auth.js API routes", () => {
  const [, matcher] = requireMatch(
    middlewareSource,
    /matcher:\s*\[\s*["']([^"']+)["']\s*,?\s*\]/,
    "middleware matcher",
  )

  assert.match(matcher, /^\/api\//)
  assert.match(matcher, /\(\?!auth/)
})

test("only versioned landing assets receive immutable caching", async () => {
  assert.equal(typeof nextConfig.headers, "function")
  const headerRules = await nextConfig.headers()
  const cacheRules = headerRules.filter((rule) =>
    rule.headers.some(({ key }) => key.toLowerCase() === "cache-control"),
  )

  assert.deepEqual(cacheRules, [
    {
      source: "/landing/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ])
})

test("middleware preserves bearer passthrough and the no-header sign-in redirect", () => {
  assert.match(
    middlewareSource,
    /isBearerAuthApiRoute\(pathname, req\.method\)[\s\S]*?req\.headers\.get\(["']authorization["']\)\?\.startsWith\(["']Bearer ["']\)[\s\S]*?return NextResponse\.next\(\)/,
  )
  assert.match(
    middlewareSource,
    /const signInUrl = new URL\(["']\/signin["'], nextUrl\.origin\)/,
  )
  assert.match(
    middlewareSource,
    /signInUrl\.searchParams\.set\(["']callbackUrl["'], `\$\{pathname\}\$\{nextUrl\.search\}`\)/,
  )
  assert.match(middlewareSource, /return NextResponse\.redirect\(signInUrl\)/)
  assert.doesNotMatch(
    middlewareSource,
    /NextResponse\.json\(\s*\{\s*error:\s*["']Unauthorized["']\s*\}/,
  )
})
