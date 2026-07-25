# F10 App Store Landing Design

Date: 2026-07-15
Issue: #364
Branch: `feat/364-app-store-landing`
Status: Approved for implementation, including responsive one-badge placement

## Goal

Make `fxracing.ca` an iOS-first storefront: one fast, polished landing page that explains the three-pick game and sends visitors to the App Store.

The public browser dashboard, login, race list, picks, leaderboard, and profile screens will no longer be served. The backend stays in place because the native iOS app still depends on its APIs, authentication, scoring, synchronization, static driver/team images, and database services.

## Decision Summary

- Use the approved **Midnight Grid** direction with restrained Apple-like glass treatment.
- Display the App Store product name **FX Racing**; “F10” remains project shorthand.
- Use two real, current iOS screenshots.
- Explain the unchanged game in one compact sequence: P1, P10, DNF, pre-qualifying bonus, then ranking.
- Serve the landing, privacy, and support pages as static HTML/CSS with no auth, database, API, or client-provider dependency.
- Redirect only the retired browser-product routes to `/`.
- Preserve every API and operational route used by iOS.
- Keep the production page annotation-free, but maintain a localhost mirror with exact-position right-click notes after every visual revision.

## Scope Boundary

### In scope

- New static landing page at `/`.
- Shared visual treatment for `/privacy` and `/support`.
- Terms remain directly reachable at `/privacy#terms`.
- Explicit redirects for retired browser-product routes.
- Removal of retired browser route entry points and proven-unused browser-only UI code.
- Root layout and middleware changes needed to keep marketing/legal pages static.
- Official App Store badge artwork and links.
- Two optimized iOS screenshots.
- Metadata, canonical URL, robots, sitemap, accessibility, and performance work.
- Local feedback companion and exact-position note preservation.
- Full shared-backend regression verification.
- A clean Release build installed and launched on the connected physical iPhone after integration.

### Preserved without contract changes

- Every file and handler under `src/app/api/**`.
- `src/auth.ts`, the session/token/callback behavior in `src/auth.config.ts`, and `src/lib/auth/**`.
- `src/lib/api/**`, `src/lib/services/**`, `src/lib/scoring/**`, `src/lib/f1/**`, and `src/lib/db/**`.
- Prisma schema, triggers, database data, AWS Lambda/EventBridge cron behavior, and operational scripts.
- Public driver and team assets under `public/drivers/**` and `public/teamlogos/**`.
- Native iOS gameplay and navigation.
- Production API origin `https://www.fxracing.ca`.

### Non-goals

- No scoring, qualifying-bonus, pick-locking, ranking, or gameplay changes.
- No API request or response changes.
- No database migration, data mutation, or credential change.
- No iOS source change in this issue.
- No removal of Vercel, API, or database infrastructure.
- No App Store upload or public release as part of the landing implementation.
- No claim that a static website alone makes native API calls faster; native responsiveness remains owned by iOS PR #363.

## Confirmed Current State

- `src/app/page.tsx` only redirects to `/races`.
- The root layout globally loads Google Inter, a `SessionProvider`, session synchronization, client error reporting, and a 430 px app shell.
- The main browser layout reads auth and database state on product pages.
- Privacy and support are already public static pages.
- Terms are an anchored section at `/privacy#terms`; there is no standalone `/terms` route.
- The iOS app hardcodes the privacy URL and uses driver/team image URLs served by this domain.
- There is no current AASA file, Associated Domains entitlement, custom URL scheme, or universal-link route.
- Apple-related server surfaces are the Auth.js Apple callback and native mobile exchange API; both remain unchanged.
- The live App Store destination is `https://apps.apple.com/app/id6762099290`.
- Baseline verification in the isolated worktree passed 79 route tests and `npx tsc --noEmit`.

## Approved Feedback

The imported notes file `f10-landing-direction-notes.json` contains three required corrections:

1. `midnight-navigation`: use the classic official App Store badge.
2. `midnight-hero`: add a second screenshot.
3. `midnight-action`: replace the custom action with the classic official App Store badge.

Apple's current [marketing guideline](https://developer.apple.com/app-store/marketing/guidelines/) says to use one App Store badge per layout. To honor the intent of both placement notes without modifying Apple's artwork:

- desktop and tablet show the official badge in the navigation;
- mobile shows the same official badge below the hero copy;
- only one badge is visible at a time;
- the alternate placement is a simple text link, not a second badge.

The badge remains black, unmodified, unrotated, at least 40 px tall, and links to the verified product page.

### Approved badge placement decision

The two notes literally request a badge in both navigation and hero, while Apple's guideline says one badge per layout. The user approved the responsive one-badge compromise above on 2026-07-15; the issue acceptance criteria must reflect that approved interpretation.

## Information Architecture

The page is deliberately one short scroll:

1. **Navigation**
   - FX Racing wordmark.
   - App Store action in the responsive placement described above.
2. **Hero**
   - Eyebrow: “PICK THE GRID”.
   - H1: “P1. P10. DNF.”
   - Lead: “One race. Three calls. Global rankings.”
   - Supporting sentence: make all three picks before qualifying to unlock bonus points, then see the score and rank after the race.
   - Two real iOS screenshots: the race-pick deck and a final picker or rankings screen.
3. **Compact rules strip**
   - P1: choose the winner.
   - P10: predict the midfield points finisher.
   - DNF: choose a non-finisher.
   - One short bonus/ranking note; no expanded feature grid.
4. **Footer**
   - Privacy, Terms, Support.
   - Unofficial fan-app notice.
   - Apple trademark credit: “Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc.”

There is no web login, dashboard preview, browser race list, testimonial section, pricing, newsletter, video, carousel, or secondary marketing funnel.

The landing copy follows the scoring source of truth: a DNF pick is rewarded for any non-classified outcome, not specifically the first retirement. The conflicting native tutorial copy is tracked separately in #365 and must not be repeated on the landing page.

## Visual System

### Direction

Midnight Grid keeps the racing identity of Direction B while adopting the clean hierarchy and restraint of Apple Sports:

- near-black canvas rather than pure decorative gradients;
- a subtle CSS grid/checker texture that fades before it competes with the content;
- off-white typography with red used only as a small racing accent;
- thin light borders, soft inner highlights, and limited translucent surfaces;
- generous spacing and large, direct type;
- straight-on screenshot panels with reserved dimensions and no fake hardware controls;
- no continuous animation, parallax, video, or large scrolling blur layers.

### Typography

Use the local system stack headed by `-apple-system` and `BlinkMacSystemFont`. Do not download or bundle a marketing font. Type should feel native through weight, scale, line height, and spacing rather than imitation of Apple proprietary assets.

### Responsive layout

- **Desktop (>= 1024 px):** copy on the left; two centered, slightly overlapping screenshot panels on the right; official badge in navigation.
- **Tablet (768–1023 px):** same hierarchy with reduced screenshot scale and no horizontal overflow.
- **Mobile (< 768 px):** centered copy, official badge in hero, two compact screenshots below, one short scroll.
- Validate at 320, 390, 768, 1024, and 1440 px.

The hero must remain visually centered. Screenshot overlap cannot pull the full composition to one side, which was a prior review correction.

## Screenshot and Badge Assets

- Capture both screenshots from the final PR #363 iOS build with fictional or guest data.
- Preferred screens:
  - race deck with the three picks visible;
  - driver picker sheet or rankings, whichever is cleanest in the final build.
- Reuse `f10-final-upcoming-review.jpg` only if it still matches the final iOS build.
- Capture a fresh second screen rather than shipping the current placeholder-portrait picker image.
- Pre-encode the final assets; the landing uses local `<img>` assets rather than relying on `next/image` transcoding.
- Give every image explicit dimensions and responsive `sizes`.
- Load only the LCP image eagerly; lazy-load the second screenshot.
- Keep both screenshot transfers at or below 400 KB combined.
- Store Apple's preferred black badge locally from the official marketing resources. Do not redraw it with an Apple icon and text.
- Preserve clear space equal to at least one-quarter of the badge height on every side.
- Capture the final screens on the current supported OS with a full network indicator, Wi-Fi indicator, and battery indicator.
- Use fictional/guest account data and no notifications or unrelated personal content.
- Complete an owner rights review for every driver, team, logo, and photograph visible in the final marketing screenshots; use a cleared or team-neutral alternative if any asset is unsuitable for marketing.

## Route Architecture

### Static routes

- `/`: App Store landing.
- `/privacy`: privacy policy.
- `/privacy#terms`: terms section.
- `/support`: support contact.
- `/robots.txt`: allow the landing/legal pages and disallow API indexing.
- `/sitemap.xml`: include only `/`, `/privacy`, and `/support`.

### Explicit legacy redirects

Redirect these browser-only routes to `/` with a rollback-friendly temporary redirect:

- `/races` and `/races/:path*`
- `/leaderboard`
- `/picks`
- `/profile` and `/profile/:path*`
- `/signin`
- `/onboarding/:path*`

The redirects live in `next.config.mjs`, not a catch-all. They must never match `/api/*`, `/privacy`, `/support`, `/.well-known/*`, `/drivers/*`, or `/teamlogos/*`.

### Browser UI retirement

- Remove the route entry points under `src/app/(main)/**` and `src/app/(auth)/**` after redirect tests exist.
- Remove global `Providers`, session-sync, client-error reporting, and browser UI modules only when a focused import audit proves they are not used outside retired pages/tests.
- Retain `/api/client-errors` even if no browser reporter calls it; the preserve-all-API boundary is intentional.
- Replace obsolete page/component test entries with landing, redirect, privacy, and support tests so CI never references deleted files.
- Browser Auth.js sign-in and error UI is intentionally retired. Point only the `pages.signIn` and `pages.error` destinations to `/`; preserve Auth.js providers, callbacks, session/token behavior, and every `/api/auth/*` handler.

### Root layout and middleware

- Root layout becomes a pure server layout with system fonts, full-width responsive content, and no mandatory client hydration.
- Landing/legal pages do not import auth, Prisma, services, `fetch`, or client providers.
- Narrow the middleware matcher to the API paths that still need its bearer/session/cron checks.
- Preserve the existing Auth.js exclusion, public API behavior, cron-secret validation, and bearer-capable API handling.
- Verify `/api/auth/session`, `/api/auth/providers`, `/api/auth/callback/apple`, and `/api/auth/mobile/exchange` are never intercepted by a legacy redirect or middleware HTML redirect.
- Static marketing/legal requests bypass auth middleware and can be served from the CDN.

## API Preservation Matrix

All existing methods and handlers remain:

- account deletion;
- Auth.js catch-all, Apple callback, mobile exchange, and session revocation;
- client error intake;
- races and race detail;
- picks;
- leaderboard;
- friends and friend actions;
- users, current user, username, team, tutorial, and suggestions;
- sync-schedule, sync-entries, lock-picks, ingest-results, and compute-scores;
- health and per-race diagnostics.

The implementation must compare the API route manifest before and after. A missing, renamed, redirected, or HTML-wrapped API response is a release blocker.

## Performance and Cost Design

### Hard requirements

- Landing performs zero runtime API, database, session, or auth calls.
- Landing import graph contains no `"use client"` component.
- No runtime external font, analytics, video, carousel library, or animation library.
- No route-specific client JavaScript beyond the shared Next.js baseline.
- Explicit image dimensions prevent layout shift.
- Use versioned landing asset filenames and a one-year immutable cache policy for only `/landing/*` screenshot, badge, and social-image files.
- Do not add caching to API or Auth.js responses.
- Initial cold transfer target: <= 500 KB.
- Lighthouse-style mobile targets: performance >= 95 and accessibility >= 95, measured from a production build when tooling is available.

### Honest impact

This removes browser dashboard data work, auth middleware on static pages, product-page server rendering, and browser UI bundles. It should reduce public-page latency and some Vercel invocations/build surface.

It does not remove the backend or database, because iOS requires them. It also does not directly improve native API response time; those improvements require backend or iOS work and are outside this issue.

## SEO and Accessibility

- Metadata base and canonical URL: `https://www.fxracing.ca`.
- Title and description use the App Store name FX Racing and describe P1/P10/DNF clearly.
- Include Open Graph/Twitter image metadata and the App Store app ID.
- Use one semantic H1 and semantic `header`, `nav`, `main`, `section`, and `footer` landmarks.
- Badge link has an accessible name; screenshot alt text describes the screen, not its appearance.
- Visible keyboard focus and at least 44 px interactive targets.
- WCAG AA contrast for body text and links.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- No horizontal overflow at supported widths.

## Local Visual Feedback Companion

The production landing ships no annotation code. A localhost mirror remains the review surface.

- Reopen it after every visual revision.
- Right-clicking captures page-relative coordinates and the nearest stable element identifier.
- Stable identifiers include navigation, hero copy, App Store action, screenshot one, screenshot two, rules strip, and footer.
- Save each note immediately and reload it after refresh.
- Record `screenId`, `routeId`, `elementId`, `xRatio`, `yRatio`, text, and timestamp.
- Preserve the direction comparison, the three imported notes, prior app review screens, and later landing revisions for comparison.
- Verify one test note through save, reload, export, and deletion before presenting the final companion.

## Verification

### Focused tests

- `src/app/page.test.mjs`
  - landing is static and not a redirect;
  - no auth, database, service, fetch, provider, or client imports;
  - correct App Store ID;
  - two distinct real screenshot assets;
  - one H1 and legal/support links.
- `src/app/landing-routes.test.mjs`
  - every retired browser route redirects to `/`;
  - API, legal, static-asset, and `.well-known` paths do not redirect;
  - middleware matcher is API-only.
- Auth tests verify the retired web page destinations now point to `/` while Auth.js callbacks, providers, session, and mobile exchange stay available.
- Preserve and run `src/app/privacy/page.test.mjs`.
- Add support-page coverage.
- Compare API route manifests before and after.

### Regression sequence

1. `npm run test:pages`
2. `npm run test:auth`
3. `npm run test:db`
4. `npm run test:routes`
5. `npm run test:services`
6. `npm run test:components`
7. `npm run test:ios`
8. `npm run test:utils`
9. `npm run test:scoring`
10. `npm run test:scripts:static`
11. `npx tsc --noEmit`
12. `npm run lint`
13. `npm run build`

The production build route table must show `/`, `/privacy`, and `/support` as static. A local production-server smoke test must confirm:

- `/`, `/privacy`, and `/support` return 200;
- retired UI routes redirect to `/`;
- invalid mobile exchange reaches its handler and returns API JSON rather than an HTML redirect;
- unauthorized cron and diagnostic requests still return 401;
- public races remains an API response;
- representative driver and team images return 200;
- versioned `/landing/*` assets return the intended long immutable cache header, while representative API/Auth.js responses do not inherit it.

## Release Sequence

1. Complete and merge iOS PR #363, then verify the production API fields it requires.
2. Update the landing branch from the resulting `main`, rerun all checks, and visually approve the localhost companion.
3. Open the landing PR, self-review the GitHub diff, and merge only after CI and Vercel preview pass.
4. Verify the exact production commit, landing page, redirects, legal pages, and API smoke tests.
5. Build the merged iOS app in Release configuration against `https://www.fxracing.ca`.
6. Verify its code signature, install it over the existing app on the connected physical iPhone, launch it, and let the user test:
   - upgrade/session restoration;
   - race swiping;
   - all available drivers;
   - average finish and DNF form;
   - P1/P10/DNF picker sheets;
   - save/persisted picks;
   - qualifying bonus presentation;
   - rankings and profile;
   - network responsiveness.
7. Delete temporary DerivedData and temporary dependency/build artifacts after successful validation.
8. Treat App Store Connect upload/review as a separate authorized release step with a verified unused build number.

## Rollback

- Landing rollback is a single squash-revert and Vercel redeploy.
- Redirects are temporary to avoid permanent browser caching during the first release.
- API, database, and iOS contracts do not change, so landing rollback requires no data recovery.
- If physical-device validation finds an iOS issue, do not upload to App Store Connect; fix it on the iOS branch and repeat the Release install.
