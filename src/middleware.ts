import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import type { Session } from "next-auth";

const { auth } = NextAuth(authConfig);

// Routes that are always publicly accessible (no session required).
const PUBLIC_ROUTES = ["/", "/signin", "/races", "/leaderboard"];

// Prefixes that are publicly accessible without authentication.
// Read-only browsing: race list, race detail, leaderboard, user profiles.
const PUBLIC_PREFIXES = ["/races/", "/profile/"];

// Prefix for all Auth.js internal API routes.
const AUTH_PREFIX = "/api/auth";

// Prefix for cron endpoints — protected by secret header, not session.
const CRON_PREFIX = "/api/cron";

// Public API routes — no session needed (race schedule, user profiles, etc.)
const PUBLIC_API_ROUTES = ["/api/races", "/api/users"];

// Prefix for the onboarding flow — authenticated users without a username
// must be allowed through here.
const ONBOARDING_PREFIX = "/onboarding";

// All non-auth API routes — let authenticated users call them freely.
const API_PREFIX = "/api";

// Auth.js v5 injects `auth` (the Session or null) onto the request object
// when `auth()` is used as a middleware wrapper.
type NextAuthRequest = NextRequest & { auth: Session | null };

export default auth((req: NextAuthRequest) => {
  const { nextUrl, auth: session } = req;
  const pathname = nextUrl.pathname;

  // ── 1. Auth.js internal routes — always pass through ──────────────────
  if (pathname.startsWith(AUTH_PREFIX)) {
    return NextResponse.next();
  }

  // ── 2. Cron routes — validated by CRON_SECRET header, not session ─────
  if (pathname.startsWith(CRON_PREFIX)) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const provided = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!cronSecret || provided !== cronSecret) {
      return new NextResponse(null, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── 3. Public routes — always pass through ────────────────────────────
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── 3b. Public API routes — no session needed ─────────────────────────
  if (PUBLIC_API_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // ── 4. Unauthenticated users → redirect to /signin ────────────────────
  if (!session) {
    const signInUrl = new URL("/signin", nextUrl.origin);
    // Preserve the intended destination so we can redirect back after login.
    signInUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  // ── 5. Authenticated but username not set → enforce onboarding ────────
  // Allow API calls through so onboarding pages can still fetch data.
  if (
    !session.user.usernameSet &&
    !pathname.startsWith(ONBOARDING_PREFIX) &&
    !pathname.startsWith(API_PREFIX)
  ) {
    return NextResponse.redirect(new URL("/onboarding/username", nextUrl.origin));
  }

  // ── 6. Username already set but visiting onboarding → send home ───────
  if (session.user.usernameSet && pathname.startsWith(ONBOARDING_PREFIX)) {
    return NextResponse.redirect(new URL("/races", nextUrl.origin));
  }

  // ── 7. All checks passed — allow the request ──────────────────────────
  return NextResponse.next();
});

export const config = {
  /*
   * Match every route EXCEPT:
   *   - Next.js internals: _next/static, _next/image
   *   - favicon.ico
   *   - Everything inside /public (images, fonts, etc.)
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
