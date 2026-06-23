# Route Testing

## Purpose
Document the lightweight API route regression pattern used by `npm run test:routes`.

## Pattern
- Extract route behavior into a small JS handler when direct Node tests need dependency injection.
- Keep Next.js route files thin: authenticate, parse, call the handler/service, return a `Response`.
- Inject dependencies (`auth`, `mobileAuth`, DB/service calls, loggers) through the handler options instead of mocking modules.
- Use `src/app/api/test-utils.mjs` for common request and auth fixtures.
- Keep tests deterministic: no network, no real database, no wall-clock dependency unless a fixed clock is injected.

## Utilities
- `jsonRequest(url, body, options)` builds JSON `Request` objects for route handlers.
- `rawRequest(url, body, options)` builds malformed/raw body requests for parser regressions.
- `authSession(userId)`, `authedDeps(userId)`, and `unauthenticatedDeps()` cover standard auth fixtures.
- `responseJson(response)` reads a response body once for assertions.

## Covered Contracts
- Auth profile: `src/app/api/users/me/get-handler.test.mjs`
- Diagnostics: `src/app/api/diag/health/get-handler.test.mjs`, `src/app/api/diag/race/route.test.mjs`
- Lock transition: `src/app/api/cron/lock-picks/route.test.mjs`
- Username validation: `src/app/api/users/username/post-handler.test.mjs`, `src/app/api/users/username/patch-handler.test.mjs`
- Scoring rules: `src/lib/scoring/formula.test.mjs` via `npm run test:scoring`

## Commands
```bash
npm run test:routes
npm run test:scoring
```
