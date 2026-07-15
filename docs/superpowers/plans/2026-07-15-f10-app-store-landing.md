# FX Racing App Store Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retired browser product with a fast, static, Apple Sports-inspired App Store landing page while preserving every API, authentication, scoring, cron, database, and native-iOS contract.

**Architecture:** The Next.js App Router serves three static marketing/legal routes (`/`, `/privacy`, `/support`) from pure server components and a small shared site shell. Explicit temporary redirects retire only the old browser-product URLs. API-only middleware retains the existing public, session, bearer, cron, and no-header redirect behavior; invalid native bearer credentials still reach handlers and return their existing API-shaped `401` responses. Versioned local marketing assets receive immutable caching; API/Auth.js responses do not. The native app and shared backend remain unchanged.

**Tech Stack:** Next.js 14 App Router, React 18 server components, CSS Modules plus the existing CSS pipeline, Node `node:test` source/contract regressions, Xcode 26.5/iOS 26.5 simulator capture, Vercel, GitHub CLI, and the existing coordinate-pinned localhost review companion.

## Global Constraints

- Preserve gameplay exactly: P1, P10, DNF, three picks, existing qualifying bonus, scoring, locking, and rankings.
- Do not modify any handler or helper under `src/app/api/**`, except to add the route-manifest test beside them.
- Preserve `src/auth.ts`, Auth.js providers/callbacks/session/token behavior, `src/lib/auth/**`, `src/lib/api/**`, `src/lib/services/**`, `src/lib/scoring/**`, `src/lib/f1/**`, `src/lib/db/**`, `prisma/**`, `lambda/**`, operational scripts, and `vercel.json`.
- Preserve `public/drivers/**` and `public/teamlogos/**`; the iOS app constructs absolute image URLs from these domain-relative paths.
- Keep `/privacy`, `/privacy#terms`, `/support`, `/api/auth/callback/apple`, `/api/auth/mobile/exchange`, and every other current API route reachable.
- Never add a catch-all redirect. Redirect only the exact retired browser routes listed in the approved specification.
- Do not introduce a redirect from `/races` until `/` is a real page; otherwise the current `/ -> /races` behavior creates a loop.
- The landing route must have no `"use client"`, auth, database, service, session-provider, runtime `fetch`, external font, analytics, video, carousel, or animation-library dependency.
- Use the visible App Store name **FX Racing**. Describe DNF as a non-finisher; do not repeat the inaccurate “first retirement” tutorial copy tracked in #365.
- Use only the official, preferred black App Store badge supplied by Apple. The owner must personally accept Apple’s App Store Marketing Artwork License before the asset is committed; an agent must not accept legal terms on the owner’s behalf.
- Show one official badge per responsive layout: navigation at `>= 768px`, hero at `< 768px`. The alternate location is a text link.
- Keep the badge unmodified, at least 40 px high, with at least one-quarter badge-height clear space.
- Ship two real current app screenshots with fictional/fixture data and a combined transfer size no greater than 409,600 bytes.
- Capture marketing screens on the current supported OS with full network, Wi-Fi, and battery indicators and no unrelated notifications or personal content.
- Complete an owner rights review for every driver, team, logo, and photograph visible in the marketing screenshots; substitute a cleared or team-neutral screen if any included material is not suitable for off-App marketing.
- Visual token system:
  - `--canvas: #050506` — full-page background;
  - `--panel: #111114` — screenshot/rule surfaces;
  - `--hairline: #2C2C30` — quiet borders and grid lines;
  - `--ink: #F5F5F7` — primary text;
  - `--muted: #A1A1A8` — supporting text;
  - `--racing-red: #E10600` — the single accent.
- Type roles use the local Apple/system stack only: display (800 weight, tight tracking), section title (700), body (450–500), and uppercase timing label (700 with wide tracking).
- Desktop layout is a centered 12-column, 1240 px composition with copy left and two centered screenshots right. Mobile is centered and one short scroll. The signature element is a P1/P10/DNF timing tower over a subtle starting-grid/checkered geometry.
- Avoid continuous motion. Respect `prefers-reduced-motion` and `prefers-reduced-transparency`; retain keyboard focus and 44 px targets.
- The production page contains no annotation logic. Preserve and update the external localhost companion after every visual revision.
- Keep all work in `/Users/gibou/code/github/f10_fantasy/.worktrees/feat-364-app-store-landing`; never touch the dirty primary checkout.
- Use isolated `node_modules` in this worktree. Do not symlink dependencies from another worktree because `prisma generate` mutates installed packages.
- Disk space is constrained. Use one temporary DerivedData directory, one isolated dependency install, and delete temporary build artifacts only after verification succeeds.
- Every commit and PR body ends with `— gib` and contains no AI co-author/footer.

---

### Task 1: Freeze the backend route manifest

**Files:**
- Create: `src/app/api/route-manifest.test.mjs`
- Modify: `package.json`

**Interface:**
- Produces a fixed inventory of every current `src/app/api/**/route.ts` entry point.
- Protects the native/backend surface during all later browser-route deletions.

- [ ] **Step 1: Install isolated dependencies in this worktree**

Run:

```bash
npm ci --prefer-offline
```

Expected: the worktree gets its own `node_modules`; no symlink or dependency sharing with another worktree is used.

- [ ] **Step 2: Add the green-before/green-after characterization test**

```js
import test from "node:test"
import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("./", import.meta.url))

async function collectRoutes(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectRoutes(path)
    if (entry.name !== "route.ts") return []
    return [relative(root, path).split(sep).join("/")]
  }))
  return nested.flat().sort()
}

test("web retirement preserves the complete API route manifest", async () => {
  assert.deepEqual(await collectRoutes(), [
    "account/route.ts",
    "auth/[...nextauth]/route.ts",
    "auth/mobile/exchange/route.ts",
    "auth/revoke-session/route.ts",
    "client-errors/route.ts",
    "cron/compute-scores/route.ts",
    "cron/ingest-results/route.ts",
    "cron/lock-picks/route.ts",
    "cron/sync-entries/route.ts",
    "cron/sync-schedule/route.ts",
    "diag/health/route.ts",
    "diag/race/[id]/route.ts",
    "friends/[id]/route.ts",
    "friends/route.ts",
    "leaderboard/route.ts",
    "picks/route.ts",
    "races/[id]/route.ts",
    "races/route.ts",
    "users/[userId]/route.ts",
    "users/me/route.ts",
    "users/suggest-usernames/route.ts",
    "users/team/route.ts",
    "users/tutorial/route.ts",
    "users/username/route.ts",
  ])
})
```

- [ ] **Step 3: Register it in the explicit route suite**

Append `src/app/api/route-manifest.test.mjs` to `test:routes` without removing any existing API test.

- [ ] **Step 4: Prove the baseline inventory is green**

Run:

```bash
node --test src/app/api/route-manifest.test.mjs
npm run test:routes
```

Expected: 1 manifest test passes; the full route suite remains 80/80 or greater.

- [ ] **Step 5: Commit the contract before production changes**

```bash
git add src/app/api/route-manifest.test.mjs package.json
git commit -m $'Lock the backend route manifest\n\n— gib'
```

### Task 2: Build the static Midnight Grid landing and legal shell

**Files:**
- Create: `src/app/page.test.mjs`
- Create: `src/app/support/page.test.mjs`
- Create: `src/app/site-chrome.test.mjs`
- Create: `src/app/site-chrome.tsx`
- Create: `src/app/site.module.css`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `public/landing/download-on-the-app-store-black-en-us-v1.svg`
- Create: `public/landing/fx-racing-race-deck-v1.jpg`
- Create: `public/landing/fx-racing-driver-picker-v1.jpg`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/privacy/page.test.mjs`
- Modify: `src/app/support/page.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces static `/`, `/privacy`, `/privacy#terms`, `/support`, `/robots.txt`, and `/sitemap.xml` output.
- Produces a shared server-only `SiteHeader`/`SiteFooter` shell with stable review identifiers.
- Consumes only local system fonts and versioned local images.

- [ ] **Step 1: Write the landing and legal source-contract tests**

`src/app/page.test.mjs` must read both `page.tsx` and `site-chrome.tsx` into a combined static source contract, then assert:

```js
assert.doesNotMatch(source, /redirect\s*\(|["']use client["']/)
assert.doesNotMatch(source, /@\/auth|@\/lib\/db|@\/lib\/services|fetch\s*\(|Providers/)
assert.match(source, /https:\/\/apps\.apple\.com\/app\/id6762099290/)
assert.match(source, /PICK THE GRID/)
assert.match(source, /P1\. P10\. DNF\./)
assert.match(source, /One race\. Three calls\. Global rankings\./)
assert.match(source, /non-finisher/)
assert.doesNotMatch(source, /first retirement/i)
assert.equal((source.match(/<h1\b/g) ?? []).length, 1)
assert.match(source, /href=["']\/privacy["']/)
assert.match(source, /href=["']\/privacy#terms["']/)
assert.match(source, /href=["']\/support["']/)
```

It must extract two distinct `/landing/fx-racing-*-v1.jpg` paths, assert both files exist, assert explicit `width`, `height`, and `sizes` props, and assert their combined `stat().size <= 409_600`.

`src/app/support/page.test.mjs` must assert the page remains static and includes `mailto:support@fxracing.ca`. Relax the privacy test’s brittle class assertion to a semantic `#terms`/`Terms of Use` assertion.

The page tests must also require exact route metadata: `/` owns canonical/Open Graph URL `/`, Privacy owns `/privacy`, and Support owns `/support`. Legal pages must not inherit the landing canonical.

`src/app/site-chrome.test.mjs` must assert the shared shell contains an FX Racing home link, responsive badge/text-link placements, an accessible App Store link name, the three legal links, the unofficial-fan notice, and Apple’s trademark credit; it must reject `"use client"` and runtime imports. The CSS contract must require `--app-store-badge-height` to be at least 40 px and the badge wrapper padding to be `calc(var(--app-store-badge-height) / 4)`.

Temporarily append the new landing/legal tests to `test:pages` and append `site-chrome.test.mjs` to `test:components`; retain all pre-retirement test entries until Task 4 deletes their source files.

- [ ] **Step 2: Run the focused tests and confirm the red state**

Run:

```bash
node --test src/app/page.test.mjs src/app/support/page.test.mjs src/app/privacy/page.test.mjs src/app/site-chrome.test.mjs
```

Expected: landing and site-chrome tests fail because `/` is still a redirect and the static shell/assets do not exist; existing legal content remains characterized.

- [ ] **Step 3: Preflight and capture two real current iOS screens**

Use the final #363 worktree at `/Users/gibou/code/github/f10_fantasy/.worktrees/feat-360-ios-race-deck-performance`. Use a Release simulator build against the production API and a guest/fictional state so driver images are current; do not use the `.gameplay` fixture’s `fixture.invalid` images for marketing.

Preflight disk and CoreSimulator before building:

```bash
df -h /Users/gibou /private/tmp
xcrun simctl list devices available
```

Require at least 6 GiB free. If `simctl` reports an invalid/refused CoreSimulator connection, stop the capture step and run `pkill -f CoreSimulatorService`, then `open -a Simulator`, wait for it to finish launching, and rerun `xcrun simctl list devices available`. If the second check still fails, treat capture as blocked and debug CoreSimulator rather than building. Do not fall back to old placeholder/corrupted captures.

Select the existing normal iPhone 17 Pro simulator from the available-device JSON, fail if it is absent, then boot it and wait for readiness:

```bash
DEVICE_UDID="$(xcrun simctl list devices available -j | node -e 'let input=""; process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => { const devices = Object.values(JSON.parse(input).devices).flat(); const device = devices.find((item) => item.isAvailable && item.name === "iPhone 17 Pro"); if (!device) process.exit(1); process.stdout.write(device.udid); });')"
test -n "$DEVICE_UDID"
open -a Simulator
xcrun simctl boot "$DEVICE_UDID" # run only when the selected device state is Shutdown
xcrun simctl bootstatus "$DEVICE_UDID" -b
xcrun simctl status_bar "$DEVICE_UDID" override --time 09:41 --cellularBars 4 --wifiBars 3 --batteryState charged --batteryLevel 100
```

Do not create another runtime or device. Build/install/launch from #363 using one task-owned DerivedData directory:

```bash
xcodebuild -project ios/FXRacing.xcodeproj -scheme FXRacing -configuration Release -destination "platform=iOS Simulator,id=$DEVICE_UDID" -derivedDataPath /private/tmp/FXRacing-marketing build
xcrun simctl install "$DEVICE_UDID" /private/tmp/FXRacing-marketing/Build/Products/Release-iphonesimulator/FXRacing.app
xcrun simctl launch --terminate-running-process "$DEVICE_UDID" com.fxracing.app
```

Use the Simulator UI to reach a guest race deck with all three pick rows, capture it, open a real-image driver picker, and capture again:

```bash
xcrun simctl io "$DEVICE_UDID" screenshot --type=png /private/tmp/fx-racing-race-deck.png
xcrun simctl io "$DEVICE_UDID" screenshot --type=png /private/tmp/fx-racing-driver-picker.png
```

Inspect both originals visually before conversion. Require a full status bar, current supported OS, fictional/guest data, real/cleared portraits, no notifications, and no placeholder blocks. Prefer the existing 736×1600 `f10-final-upcoming-review.jpg` only if a fresh race-deck capture is not visually cleaner. The second asset must be the driver picker so its filename, stable review ID, and alt text remain truthful.

Normalize both images without altering app content:

```bash
sips -s format jpeg -s formatOptions 72 --resampleWidth 736 INPUT.png --out OUTPUT.jpg
sips -g pixelWidth -g pixelHeight OUTPUT.jpg
wc -c public/landing/fx-racing-race-deck-v1.jpg public/landing/fx-racing-driver-picker-v1.jpg
```

Expected: each image is 736 px wide, neither is visibly degraded, and the combined byte count is at most 409,600.

After the optimized assets are accepted, delete only `/private/tmp/FXRacing-marketing` and the two task-owned source PNGs to reclaim disk space.

- [ ] **Step 4: Acquire the official badge after owner acceptance**

After the owner confirms acceptance of Apple’s Marketing Artwork License, fetch only Apple’s English preferred-black SVG:

```bash
curl --fail --location --silent --show-error 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83' -o /private/tmp/fx-racing-app-store-badge.svg
file -b --mime-type /private/tmp/fx-racing-app-store-badge.svg | grep -Fx 'image/svg+xml'
xmllint --noout /private/tmp/fx-racing-app-store-badge.svg
```

All three commands must exit 0. Preserve the bytes/aspect ratio without editing the artwork, import it as `public/landing/download-on-the-app-store-black-en-us-v1.svg`, and verify the imported file has the same SHA-256 as the temporary Apple download. Do not use third-party or recreated badge art.

- [ ] **Step 5: Implement the pure server shell and metadata**

`src/app/layout.tsx` must hold only metadata that is truly common to every route:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://www.fxracing.ca"),
  title: { default: "FX Racing — P1. P10. DNF.", template: "%s — FX Racing" },
  description: "Pick the winner, the P10 finisher, and a non-finisher before qualifying, then climb the global rankings.",
  appleWebApp: { title: "FX Racing" },
  itunes: { appId: "6762099290" },
}
```

`src/app/page.tsx` must own home-only canonical/social metadata:

```tsx
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "FX Racing",
    images: [{ url: "/landing/fx-racing-race-deck-v1.jpg", width: 736, height: 1600 }],
  },
  twitter: { card: "summary_large_image", images: ["/landing/fx-racing-race-deck-v1.jpg"] },
}
```

Remove `next/font/google`, `Providers`, and the 430 px shell. Use `<body>{children}</body>` and local/system CSS only.

`site-chrome.tsx` must export server-only `SiteHeader` and `SiteFooter`. Use stable IDs/data attributes: `landing-navigation`, `landing-app-store-navigation`, `landing-app-store-hero`, `landing-footer`.

- [ ] **Step 6: Implement the landing composition**

Wireframe:

```text
┌────────────────────────────────────────────────────────────┐
│ FX RACING                         [App Store badge]         │
├────────────────────────────────────────────────────────────┤
│ PICK THE GRID                 ┌ race deck ┐ ┌ picker ┐      │
│ P1. P10. DNF.                │           │ │        │      │
│ One race. Three calls.       │           │ │        │      │
│ Global rankings.             └───────────┘ └────────┘      │
│ [mobile-only App Store badge / desktop text link]          │
├────────────────────────────────────────────────────────────┤
│ P1  winner │ P10  midfield finisher │ DNF  non-finisher    │
│ Make all three calls before qualifying for bonus points.   │
├────────────────────────────────────────────────────────────┤
│ Privacy · Terms · Support · fan notice · Apple credit       │
└────────────────────────────────────────────────────────────┘
```

Use semantic landmarks and exactly one H1. Reserve screenshot aspect ratios. Load the race deck eagerly with `priority`; lazy-load the second image. At 768 px, switch badge placements so exactly one official badge is visible. Keep screenshot grouping mathematically centered; overlap can be visual but must not change the layout box’s center.

- [ ] **Step 7: Restyle legal routes and add metadata routes**

Use the shared header/footer on Privacy and Support. Keep all legal text, the exact `#terms` anchor, and the support email. Give Privacy `alternates.canonical`/`openGraph.url` `/privacy` and Support `/support`; test those exact values. Add:

```ts
// robots.ts
return { rules: { userAgent: "*", allow: ["/", "/privacy", "/support"], disallow: ["/api/"] }, sitemap: "https://www.fxracing.ca/sitemap.xml" }

// sitemap.ts
return ["/", "/privacy", "/support"].map((path) => ({
  url: `https://www.fxracing.ca${path}`,
  changeFrequency: path === "/" ? "weekly" : "monthly",
  priority: path === "/" ? 1 : 0.4,
}))
```

- [ ] **Step 8: Make the focused suite green and commit**

Run:

```bash
node --test src/app/page.test.mjs src/app/support/page.test.mjs src/app/privacy/page.test.mjs src/app/site-chrome.test.mjs
npx tsc --noEmit
npm run lint
```

Expected: all focused tests, type checking, and lint pass.

```bash
git add src/app public/landing package.json
git commit -m $'Build the static FX Racing landing page\n\n— gib'
```

### Task 3: Configure exact redirects, API-only middleware, and cache boundaries

**Files:**
- Create: `src/app/landing-routes.test.mjs`
- Modify: `next.config.mjs`
- Modify: `src/middleware.ts`
- Modify: `src/auth.config.ts`
- Modify: `src/auth-callbacks.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes the real `/` page from Task 2, avoiding a redirect loop.
- Produces eight temporary legacy redirect rules, API-only middleware with unchanged authorization behavior, and landing-only immutable caching.

- [ ] **Step 1: Write the failing route, middleware, auth-page, and cache tests**

`src/app/landing-routes.test.mjs` must import `next.config.mjs` and assert this exact redirect array:

```js
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
```

It must prove those sources do not match `/api/races`, `/privacy`, `/support`, `/.well-known/apple-app-site-association`, `/drivers/hamilton.png`, or `/teamlogos/ferrari.webp`. It must assert the middleware matcher begins with `/api/` and excludes `auth`. It must assert only `/landing/:path*` receives `Cache-Control: public, max-age=31536000, immutable`. It must source-check that bearer-capable requests still pass through and unauthenticated no-header requests still build the existing `/signin?callbackUrl=...` redirect; it must reject a new generic `NextResponse.json({ error: "Unauthorized" })` middleware response.

Extend `src/auth-callbacks.test.mjs`:

```js
test("Auth.js retired browser destinations point to landing", () => {
  const [, pagesBody] = requireMatch(
    edgeAuthConfigSource,
    /pages:\s*\{([\s\S]*?)\n\s*\},/,
    "Auth.js pages configuration",
  )
  assert.match(pagesBody, /signIn:\s*["']\/["']/)
  assert.match(pagesBody, /error:\s*["']\/["']/)
  assert.doesNotMatch(pagesBody, /\/signin/)
})
```

Append `landing-routes.test.mjs` to `test:pages`; retain the pre-retirement page tests until Task 4.

- [ ] **Step 2: Run the new contracts and confirm red**

Run:

```bash
node --test src/app/landing-routes.test.mjs src/auth-callbacks.test.mjs
```

Expected: failures because redirects are absent, middleware is catch-all, cache headers are absent, and Auth.js still points to `/signin`.

- [ ] **Step 3: Add explicit redirects and landing-asset caching**

`next.config.mjs` must preserve the three security headers and existing image configuration, add the exact `redirects()` array, and add a separate header entry:

```js
{
  source: "/landing/:path*",
  headers: [{
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  }],
}
```

Do not add cache headers to `/api/:path*`, `/api/auth/:path*`, or the global header block.

- [ ] **Step 4: Reduce middleware to the API contract**

Keep `NextAuth(authConfig)`, `isBearerAuthApiRoute`, `isCronRoutePath`, and the existing `isPublicApiRoute` method/path logic. Remove browser page/public-prefix/onboarding branches that can no longer be matched, but preserve the existing no-header and bearer behavior exactly. For matched non-public API requests:

```ts
if (!session) {
  if (
    isBearerAuthApiRoute(pathname, req.method) &&
    req.headers.get("authorization")?.startsWith("Bearer ")
  ) {
    return NextResponse.next()
  }

  const signInUrl = new URL("/signin", nextUrl.origin)
  signInUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`)
  return NextResponse.redirect(signInUrl)
}

return NextResponse.next()
```

Use one API-only matcher that excludes Auth.js, for example:

```ts
export const config = {
  matcher: ["/api/((?!auth(?:/|$)).*)"],
}
```

Build verification, not source matching alone, decides whether the matcher syntax is valid. Source and smoke tests must prove an unauthenticated no-header request keeps its existing redirect response, while `Authorization: Bearer invalid` reaches a bearer-capable handler and returns its existing API response.

- [ ] **Step 5: Point only Auth.js web page destinations to `/`**

Change `pages.signIn` and `pages.error` to `/`. Do not change sessions, JWTs, callbacks, providers, Apple callback, or mobile exchange.

- [ ] **Step 6: Make focused and adjacent auth/API tests green**

Run:

```bash
node --test src/app/landing-routes.test.mjs src/auth-callbacks.test.mjs
npm run test:auth
npm run test:routes
npx tsc --noEmit
npm run build
```

Expected: contracts pass; Next accepts the matcher; build shows `/`, `/privacy`, and `/support` as static.

- [ ] **Step 7: Commit the route boundary**

```bash
git add next.config.mjs src/middleware.ts src/auth.config.ts src/auth-callbacks.test.mjs src/app/landing-routes.test.mjs package.json
git commit -m $'Retire browser routes behind the landing page\n\n— gib'
```

### Task 4: Remove the unused browser UI and direct dependencies

**Files:**
- Create: `src/app/retired-browser-ui.test.mjs`
- Delete: `src/app/(main)/**`
- Delete: `src/app/(auth)/**`
- Delete: `src/components/**`
- Delete: `src/app/error.tsx`
- Delete: `src/lib/observability/report-client-error.ts`
- Delete: `src/lib/utils.ts`
- Delete: `src/lib/utils.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tailwind.config.ts`
- Modify: `ai/docs/architecture.md`
- Modify: `ai/docs/decisions.md`
- Modify: `ai/docs/worklog.md`

**Interfaces:**
- Removes only modules proven exclusive to the retired browser product.
- Preserves `src/app/api/client-errors/route.ts`, `src/lib/observability/client-errors.js`, and its redaction tests.

- [ ] **Step 1: Write the failing retirement guard**

`src/app/retired-browser-ui.test.mjs` must assert `ENOENT` for the retired route groups, component tree, browser reporter, and UI utility, while asserting the client-error intake API still exists. It must assert these direct dependencies are absent from both dependency blocks:

```text
@radix-ui/react-dialog
@radix-ui/react-scroll-area
@radix-ui/react-select
@radix-ui/react-slot
@radix-ui/react-tabs
class-variance-authority
clsx
framer-motion
lucide-react
swr
tailwind-merge
tailwindcss-animate
```

Use this concrete test shape:

```js
import test from "node:test"
import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"

const retiredEntries = [
  new URL("./(main)", import.meta.url),
  new URL("./(auth)", import.meta.url),
  new URL("../components", import.meta.url),
  new URL("./error.tsx", import.meta.url),
  new URL("../lib/observability/report-client-error.ts", import.meta.url),
  new URL("../lib/utils.ts", import.meta.url),
]

const browserOnlyDependencies = [
  "@radix-ui/react-dialog",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-slot",
  "@radix-ui/react-tabs",
  "class-variance-authority",
  "clsx",
  "framer-motion",
  "lucide-react",
  "swr",
  "tailwind-merge",
  "tailwindcss-animate",
]

test("retired browser UI stays removed", async () => {
  for (const entry of retiredEntries) {
    await assert.rejects(access(entry), { code: "ENOENT" })
  }
})

test("browser-only dependencies stay removed", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  )
  for (const dependency of browserOnlyDependencies) {
    assert.equal(pkg.dependencies?.[dependency], undefined)
    assert.equal(pkg.devDependencies?.[dependency], undefined)
  }
  const tailwind = await readFile(
    new URL("../../tailwind.config.ts", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(tailwind, /tailwindcss-animate/)
})

test("client-error intake API remains available", async () => {
  await assert.doesNotReject(
    access(new URL("./api/client-errors/route.ts", import.meta.url)),
  )
})
```

- [ ] **Step 2: Run the guard and confirm red**

Run: `node --test src/app/retired-browser-ui.test.mjs`

Expected: failures because the routes/components/dependencies still exist.

- [ ] **Step 3: Delete only the audited browser files**

Delete the two route groups, the complete current `src/components` tree, the custom browser error boundary/reporter, and `src/lib/utils.ts` plus its test. Do not delete the client-error API sanitizer/intake files.

Run an import audit immediately:

```bash
rg -n "@/components|@/lib/utils|report-client-error|framer-motion|lucide-react|swr|@radix-ui|class-variance-authority|tailwind-merge" src ios scripts --glob '!**/*.test.mjs'
```

Expected: no production imports remain.

- [ ] **Step 4: Remove only proven-unused direct packages**

Remove the 12 packages listed above from `package.json`. Remove only the `tailwindcss-animate` plugin line from `tailwind.config.ts`; retain the existing Tailwind/PostCSS toolchain to avoid widening this change. Regenerate the lockfile with the current npm version:

```bash
npm install --package-lock-only --ignore-scripts
```

Do not remove Next.js, React, NextAuth, Prisma, Jose, Zod, Dotenv, Tailwind, PostCSS, or Autoprefixer.

- [ ] **Step 5: Replace obsolete explicit test entries**

Resulting scripts:

```json
{
  "test:pages": "node --test src/app/page.test.mjs src/app/landing-routes.test.mjs src/app/privacy/page.test.mjs src/app/support/page.test.mjs",
  "test:components": "node --test src/app/site-chrome.test.mjs src/app/retired-browser-ui.test.mjs",
  "test:utils": "node --test src/lib/observability/client-errors.test.mjs"
}
```

Keep every existing API/service/auth/iOS/scoring/static-script test entry. Append, never replace, the API manifest test in `test:routes`.

- [ ] **Step 6: Update shared architecture, decision, and worklog memory**

Record that the public browser surface is now static marketing/legal only, legacy product routes redirect, API/Auth.js/native contracts remain, and driver/team assets are server contract assets. Add the durable accepted iOS-first/static-web decision to `ai/docs/decisions.md`. Do not include secrets or claim the backend was removed.

- [ ] **Step 7: Make retirement and full source suites green**

Run:

```bash
npm run test:components
npm run test:pages
npm run test:utils
npm run test:auth
npm run test:routes
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all pass; build contains no retired page routes or custom client error boundary.

- [ ] **Step 8: Commit the cleanup**

```bash
git add -A -- 'src/app/(main)' 'src/app/(auth)' src/components src/app/error.tsx src/lib/observability/report-client-error.ts src/lib/utils.ts src/lib/utils.test.mjs src/app/retired-browser-ui.test.mjs package.json package-lock.json tailwind.config.ts ai/docs/architecture.md ai/docs/decisions.md ai/docs/worklog.md
git commit -m $'Remove the retired browser product UI\n\n— gib'
```

### Task 5: Refresh and verify the coordinate-pinned review companion

**Files outside the repository:**
- Modify: `/Users/gibou/.codex/visualizations/2026/07/12/019f552b-9525-7b70-87a2-977c18f8bf29/landing-direction-review-local-v1.html`
- Preserve: `/Users/gibou/.codex/visualizations/2026/07/12/019f552b-9525-7b70-87a2-977c18f8bf29/landing-direction-comparison-v4.html`
- Preserve/import: `/Users/gibou/Downloads/f10-landing-direction-notes.json`

**Interfaces:**
- Produces an annotation-only localhost mirror of the exact production layout.
- Persists `{ screenId, routeId, elementId, xRatio, yRatio, text, timestamp }` immediately in local storage.

- [ ] **Step 1: Add a final implementation screen without deleting history**

Keep Direction B, the three imported notes, prior app screens, and previous notes. Add a `landing-implementation-v1` screen mirroring the production tokens, copy, badge placement, screenshots, rules, and footer. Give the nearest-note targets stable identifiers:

```text
landing-navigation
landing-hero-copy
landing-app-store-action
landing-screenshot-race-deck
landing-screenshot-driver-picker
landing-rules-strip
landing-footer
```

- [ ] **Step 2: Keep production and review concerns separate**

The companion may use right-click/context-menu listeners, note pins, editor UI, local storage, export, and deletion. Confirm none of those strings or scripts appear under `src/app/**` or `public/landing/**`.

- [ ] **Step 3: Reopen the canonical companion**

Ensure the existing server on port 50568 is serving the visualization root, then open:

```text
http://127.0.0.1:50568/landing-direction-review-local-v1.html
```

- [ ] **Step 4: Verify notes end to end in the browser**

Create one clearly labeled temporary note with a right-click on `landing-screenshot-driver-picker`. Verify exact pin placement and captured route/element IDs. Refresh and verify persistence. Export JSON and inspect its schema. Delete the temporary note and refresh again to prove deletion. Preserve all genuine user notes.

- [ ] **Step 5: Visually inspect all required widths**

Inspect 320, 390, 768, 1024, and 1440 px. Confirm:

- hero composition remains centered;
- exactly one official badge is visible at each width;
- badge height/clear space are compliant;
- two screenshots are visible without horizontal overflow;
- body/footer contrast and keyboard focus are clear;
- reduced-motion and reduced-transparency fallbacks remain legible.

Record screenshots or browser evidence in the task report. Do not commit the external companion into the production app.

### Task 6: Run full local regression, production smoke, performance, and branch review

**Files:**
- Modify only if a verified failure requires a scoped correction.
- Create task evidence under `.superpowers/sdd/` as required by subagent-driven development; do not ship temporary performance output.

- [ ] **Step 1: Reinstall from the final lockfile once**

Run in the landing worktree. `npm ci` intentionally replaces the pre-cleanup install so this verification proves the pruned lockfile from a clean dependency state:

```bash
npm ci --prefer-offline
```

Expected: install succeeds without sharing another worktree’s `node_modules`.

- [ ] **Step 2: Run the complete CI-equivalent suite**

```bash
npm run test:pages
npm run test:auth
npm run test:db
npm run test:routes
npm run test:services
npm run test:components
npm run test:ios
npm run test:utils
npm run test:scoring
npm run test:scripts:static
npx tsx scripts/test-mobile-provider-email.ts
npx tsc --noEmit
npm run lint
npm run build
```

Expected: every command exits 0. The API manifest is identical to Task 1.

- [ ] **Step 3: Inspect the production build artifact**

Confirm `.next/server/app-paths-manifest.json` still contains every API entry. Assert `.next/prerender-manifest.json` contains `/`, `/privacy`, and `/support` and none of the retired product pages. Inspect `.next/server/app/page_client-reference-manifest.js` and prove it contains no client module sourced from `src/app/page.tsx`, `src/app/site-chrome.tsx`, or any retired `src/components` path.

```bash
node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; const paths = JSON.parse(fs.readFileSync(".next/server/app-paths-manifest.json", "utf8")); const prerender = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")); for (const route of ["/", "/privacy", "/support"]) assert.ok(prerender.routes[route], `${route} must be prerendered`); const appEntries = Object.keys(paths); assert.equal(appEntries.some((entry) => /\/(?:races|leaderboard|picks|profile|signin|onboarding)(?:\/[^/]+)*\/page$/.test(entry)), false, `retired page entry remains: ${appEntries.join(", ")}`); const apiEntries = appEntries.filter((entry) => entry.startsWith("/api/")).sort(); assert.equal(apiEntries.length, 24);'
rg -n 'src/app/page\.tsx|src/app/site-chrome\.tsx|src/components' .next/server/app/page_client-reference-manifest.js
```

Expected: the Node assertion exits 0 and `rg` finds no matching client reference.

- [ ] **Step 4: Start the production server and run read-only smoke tests**

Use port 3104, which does not conflict with the companion. Start `npm run start -- --port 3104` in a dedicated PTY/session, wait for the ready line, run the smoke calls from a second terminal, then send Ctrl-C and verify the server exited.

Capture headers and bodies instead of relying on browser impressions:

```bash
curl --fail --silent --show-error --compressed -D /private/tmp/f10-root.headers -o /private/tmp/f10-root.html http://127.0.0.1:3104/
curl --fail --silent --show-error --compressed -D /private/tmp/f10-privacy.headers -o /private/tmp/f10-privacy.html http://127.0.0.1:3104/privacy
curl --fail --silent --show-error --compressed -D /private/tmp/f10-support.headers -o /private/tmp/f10-support.html http://127.0.0.1:3104/support
curl --silent --show-error -D /private/tmp/f10-races.headers -o /dev/null http://127.0.0.1:3104/races
curl --silent --show-error -D /private/tmp/f10-profile.headers -o /dev/null http://127.0.0.1:3104/profile/example
curl --silent --show-error -X POST -D /private/tmp/f10-picks-no-header.headers -o /dev/null http://127.0.0.1:3104/api/picks
curl --silent --show-error -X POST -H 'Authorization: Bearer invalid' -D /private/tmp/f10-picks-invalid-bearer.headers -o /private/tmp/f10-picks-invalid-bearer.json http://127.0.0.1:3104/api/picks
curl --silent --show-error -D /private/tmp/f10-auth.headers -o /private/tmp/f10-auth.json http://127.0.0.1:3104/api/auth/providers
curl --silent --show-error -D /private/tmp/f10-auth-session.headers -o /private/tmp/f10-auth-session.json http://127.0.0.1:3104/api/auth/session
curl --silent --show-error -X POST -H 'Content-Type: application/json' --data '{}' -D /private/tmp/f10-mobile-exchange.headers -o /private/tmp/f10-mobile-exchange.json http://127.0.0.1:3104/api/auth/mobile/exchange
curl --silent --show-error -X POST -D /private/tmp/f10-cron.headers -o /private/tmp/f10-cron.json http://127.0.0.1:3104/api/cron/compute-scores
curl --silent --show-error -H 'Authorization: Bearer invalid' -D /private/tmp/f10-diag.headers -o /private/tmp/f10-diag.json http://127.0.0.1:3104/api/diag/health
curl --fail --silent --show-error -D /private/tmp/f10-driver.headers -o /dev/null http://127.0.0.1:3104/drivers/hamilton.png
curl --fail --silent --show-error -D /private/tmp/f10-team.headers -o /dev/null http://127.0.0.1:3104/teamlogos/ferrari.webp
curl --fail --silent --show-error -D /private/tmp/f10-landing-asset.headers -o /dev/null http://127.0.0.1:3104/landing/fx-racing-race-deck-v1.jpg
```

Create `/private/tmp/f10-landing-smoke-assert.mjs` with `apply_patch`, using this exact assertion body, then run it:

```js
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (name, extension = "headers") =>
  readFileSync(`/private/tmp/${name}.${extension}`, "utf8")
const status = (name) => Number(read(name).match(/^HTTP\/\S+\s+(\d+)/m)?.[1])
const header = (name, key) =>
  read(name).match(new RegExp(`^${key}:\\s*(.+)$`, "im"))?.[1].trim() ?? ""

for (const name of ["f10-root", "f10-privacy", "f10-support"]) {
  assert.equal(status(name), 200)
  assert.match(header(name, "content-type"), /text\/html/)
}
for (const name of ["f10-races", "f10-profile"]) {
  assert.equal(status(name), 307)
  assert.match(header(name, "location"), /\/$/)
}
assert.equal(status("f10-picks-no-header"), 307)
assert.match(header("f10-picks-no-header", "location"), /\/signin\?callbackUrl=/)
assert.equal(status("f10-picks-invalid-bearer"), 401)
assert.match(header("f10-picks-invalid-bearer", "content-type"), /application\/json/)
assert.match(read("f10-picks-invalid-bearer", "json"), /Unauthorized/)
for (const name of ["f10-auth", "f10-auth-session"]) {
  assert.equal(status(name), 200)
  assert.match(header(name, "content-type"), /application\/json/)
  assert.doesNotMatch(header(name, "cache-control"), /immutable/)
}
assert.equal(status("f10-mobile-exchange"), 400)
assert.match(header("f10-mobile-exchange", "content-type"), /application\/json/)
assert.match(read("f10-mobile-exchange", "json"), /provider must be/)
for (const name of ["f10-cron", "f10-diag"]) assert.equal(status(name), 401)
for (const name of ["f10-driver", "f10-team", "f10-landing-asset"]) {
  assert.equal(status(name), 200)
  assert.match(header(name, "content-type"), /^image\//)
}
assert.match(
  header("f10-landing-asset", "cache-control"),
  /public, max-age=31536000, immutable/,
)
```

Run: `node /private/tmp/f10-landing-smoke-assert.mjs`

Expected: exit 0. This proves HTML routes/statuses are 200; `/races` and `/profile/example` are 307 with `Location: /`; no-header `/api/picks` remains the existing 307 to `/signin?...`; invalid-bearer `/api/picks` is 401 `application/json` containing `Unauthorized`; Auth.js providers/session are JSON and do not redirect; cron/diagnostic requests are 401; image assets are 200 with image content types; the versioned landing asset contains `public, max-age=31536000, immutable`; Auth.js headers do not contain `immutable`.

Verify:

```text
GET /                              -> 200 HTML
GET /privacy                       -> 200 HTML
GET /support                       -> 200 HTML
GET /races                         -> temporary redirect to /
GET /profile/example               -> temporary redirect to /
POST /api/picks without header     -> existing temporary /signin redirect
POST /api/picks invalid Bearer     -> 401 JSON from the handler
GET /api/auth/providers            -> Auth.js JSON, never legacy redirect
POST /api/auth/mobile/exchange {}  -> 400 JSON from the native auth handler
POST /api/cron/compute-scores      -> 401 without CRON_SECRET
GET /api/diag/health               -> 401 without auth
GET /drivers/hamilton.png          -> 200 image
GET /teamlogos/ferrari.webp        -> 200 image
GET /landing/...-v1.jpg            -> 200 with immutable cache header
GET /api/auth/session              -> no landing immutable cache header
```

Do not send a valid cron secret and do not call a mutating endpoint with authorization.

- [ ] **Step 5: Verify payload and rendering budgets**

Open `http://127.0.0.1:3104/` in a fresh browser context with cache disabled and hard-reload once. Evaluate the Performance API and count each same-origin initial URL once:

```js
const navigation = performance.getEntriesByType("navigation")[0]
const resources = performance.getEntriesByType("resource")
const unique = new Map(resources.map((entry) => [entry.name, entry.transferSize]))
const totalTransferBytes = navigation.transferSize +
  [...unique.values()].reduce((sum, bytes) => sum + bytes, 0)
({
  document: navigation.transferSize,
  resources: [...unique.entries()].map(([url, transferSize]) => ({ url, transferSize })),
  totalTransferBytes,
})
```

Record the returned URL/byte table. The cold initial same-origin transfer target is at most 512,000 bytes; screenshots together remain at most 409,600 bytes. Confirm no Google font request and no client resource attributable to the landing source, backed by the Task 6 Step 3 manifest check. Run Lighthouse mobile only if already available without a large install; otherwise record the deterministic transfer table, prerender manifest, zero-client-import check, contrast, and responsive browser evidence rather than downloading new tooling on the low-storage Mac.

- [ ] **Step 6: Self-review the complete diff**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
rg -n "TODO|TBD|FIXME|placeholder|first retirement|use client|accept.*agreement" src/app public/landing next.config.mjs src/middleware.ts --glob '!**/*.test.mjs'
```

Expected: no whitespace errors, placeholders, inaccurate DNF copy, landing client code, or agent acceptance claim. Confirm all user-authored/dirty-main work remains untouched.

- [ ] **Step 7: Request task-level and final branch reviews**

Use fresh reviewers per subagent-driven development. Fix and re-review all Critical/Important findings. Run the full verification sequence again after the last change.

- [ ] **Step 8: Record the pre-integration evidence and stop before PR creation**

Record exact test totals, build/prerender evidence, smoke assertions, transfer table, and visual-review paths in the task report. Keep the worktree clean. Do not open or merge the landing PR yet; #363 must merge first so the landing branch can be replayed and verified on the actual new `main`.

### Task 7: Integrate the iOS branch and open the Release build on the physical iPhone

**Dependencies:**
- iOS PR #363 is green and ready for final review/merge.
- The landing branch is locally complete, clean, and has passed Task 6.
- The owner has confirmed Apple marketing-artwork terms before the badge is committed.
- #365 remains separately tracked unless explicitly fixed and verified before this task.

- [ ] **Step 1: Review and merge iOS PR #363 first**

Inspect the full PR diff and green checks, mark it ready if still draft, then squash-merge #363 and delete its remote branch. Do not modify or pull the dirty primary checkout.

- [ ] **Step 2: Replay landing onto the new main and rerun all evidence**

In the landing worktree:

```bash
git fetch origin
git rebase origin/main
```

Resolve only intentional landing overlaps. Confirm the API route manifest remains fixed and the two screenshots still match the now-merged native UI. Rerun every Task 6 command and the localhost companion review after the rebase. Fix/re-review any failure before publishing.

- [ ] **Step 3: Create the exact landing PR body**

Create `/private/tmp/f10-landing-pr-body.md` with `apply_patch` and this exact content:

```markdown
## Summary

- replace the retired browser product with a static FX Racing App Store landing page
- keep Privacy, Terms, Support, every API/Auth.js route, scoring, cron, driver image, and team image contract intact
- redirect only the explicitly retired browser routes and remove their unused UI dependencies
- ship two optimized current iOS screenshots and the official Apple-supplied App Store badge

## Verification

- [x] all named Node suites
- [x] TypeScript, ESLint, and production Next.js build
- [x] fixed API route manifest and API/auth/static-asset smoke tests
- [x] static route, immutable-cache, transfer-budget, and zero-client-import checks
- [x] 320/390/768/1024/1440 visual review plus right-click note save/reload/export/delete

Closes #364

— gib
```

- [ ] **Step 4: Push and open the landing PR**

```bash
git push -u origin feat/364-app-store-landing
gh pr create --base main --head feat/364-app-store-landing --title "Replace the web app with an App Store landing page" --body-file /private/tmp/f10-landing-pr-body.md
```

- [ ] **Step 5: Review GitHub, CI, preview, then merge**

Inspect `gh pr diff`, all PR checks, and the Vercel preview. Re-run the read-only route/API/static/cache smoke matrix against the preview. Confirm the preview matches the companion. Fix and re-review any Critical/Important issue. Squash-merge with remote-branch deletion only after everything is green.

- [ ] **Step 6: Verify the exact deployed production commit**

Confirm `https://www.fxracing.ca` serves the merged landing commit, exact redirects/legal routes, unchanged APIs, driver/team assets, and cache boundaries. Confirm the two production screenshots match the merged native UI. Repeat only read-only/unauthorized smoke calls; never send a valid cron secret or authorized mutation.

- [ ] **Step 7: Build Release for the connected phone**

From a clean worktree at merged `origin/main`, preflight disk and the previously audited device before invoking Xcode:

```bash
df -h /Users/gibou /private/tmp
xcrun devicectl list devices --timeout 10
xcrun devicectl list devices --timeout 10 | rg '00008130-001E318020FA8D3A'
```

Require at least 6 GiB free and a visible, available, unlocked/trusted device. Prefer USB. If CoreDevice times out or the audited identifier is absent, stop before building, repair/re-audit device connectivity, and use the newly verified live identifier consistently; do not guess or silently install to another device. Ensure the Task 2 `/private/tmp/FXRacing-marketing` directory is already removed so only one native DerivedData tree exists.

Then build:

```bash
xcodebuild \
  -project ios/FXRacing.xcodeproj \
  -scheme FXRacing \
  -configuration Release \
  -destination 'platform=iOS,id=00008130-001E318020FA8D3A' \
  -derivedDataPath /private/tmp/FXRacing-physical \
  build

codesign --verify --deep --strict \
  /private/tmp/FXRacing-physical/Build/Products/Release-iphoneos/FXRacing.app
```

Use Release because Debug points to localhost. Do not print signing secrets or provisioning contents.

- [ ] **Step 8: Install in place and launch**

With the phone unlocked and preferably connected over USB:

```bash
xcrun devicectl device install app \
  --device 00008130-001E318020FA8D3A \
  /private/tmp/FXRacing-physical/Build/Products/Release-iphoneos/FXRacing.app

xcrun devicectl device process launch \
  --device 00008130-001E318020FA8D3A \
  --terminate-existing \
  com.fxracing.app
```

Verify the installed bundle reports FX Racing 1.7.1 build 44 (or the exact later merged version/build) and that the in-place upgrade preserved session/local data.

- [ ] **Step 9: Let the user perform the final live pass**

Ask the user to test race swiping, all 22 drivers/11 teams, Avg/DNF season form, trailing pick chevrons, P1/P10/DNF picker sheets, save/persistence, qualifying bonus, rankings/profile, and network responsiveness. Treat any reproducible issue with systematic debugging and a focused regression before changing code.

- [ ] **Step 10: Reclaim temporary disk space**

After successful verification, delete `/private/tmp/FXRacing-physical`, the landing worktree’s `node_modules` and `.next`, and obsolete temporary screenshot captures. Do not delete source assets, the review companion/history, user files, or any simulator runtime the user still uses.

- [ ] **Step 11: Close the work with evidence**

Report merged PRs/issues, exact test totals/commands, production smoke evidence, installed app version, and remaining #365 status. Do not claim an App Store Connect upload or public binary release; that requires a separate authorized release step and an unused build number.
