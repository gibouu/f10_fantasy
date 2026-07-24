import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import type { Session } from "next-auth";
import { isBearerAuthApiRoute } from "@/lib/auth/bearerRoute";
import { isCronRoutePath } from "@/lib/auth/cronPath";

const { auth } = NextAuth(authConfig);

// Auth.js v5 injects `auth` (the Session or null) onto the request object
// when `auth()` is used as a middleware wrapper.
type NextAuthRequest = NextRequest & { auth: Session | null };

function isPublicRaceApiGet(pathname: string, method: string): boolean {
  return (
    method === "GET" &&
    (pathname === "/api/races" || pathname.startsWith("/api/races/"))
  );
}

function isPublicApiRoute(pathname: string, method: string): boolean {
  if (pathname === "/api/client-errors") {
    return method === "POST";
  }

  if (pathname === "/api/races" || pathname.startsWith("/api/races/")) {
    return method === "GET";
  }

  if (pathname === "/api/users/suggest-usernames") {
    return method === "GET";
  }

  if (pathname === "/api/users/username") {
    return method === "GET";
  }

  return (
    method === "GET" &&
    pathname !== "/api/users/me" &&
    /^\/api\/users\/[^/]+$/.test(pathname)
  );
}

const authMiddleware = auth((req: NextAuthRequest) => {
  const { nextUrl, auth: session } = req;
  const pathname = nextUrl.pathname;

  // ── 1. Cron routes — validated by CRON_SECRET header, not session ─────
  if (isCronRoutePath(pathname)) {
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

  // ── 2. Public API routes — no session needed ──────────────────────────
  if (isPublicApiRoute(pathname, req.method)) {
    return NextResponse.next();
  }

  // ── 3. Unauthenticated users → preserve the existing API contract ─────
  if (!session) {
    // Only explicit Bearer-capable API routes bypass the web-session redirect.
    // Those handlers must validate either mobileAuth(req) or CRON_SECRET.
    if (
      isBearerAuthApiRoute(pathname, req.method) &&
      req.headers.get("authorization")?.startsWith("Bearer ")
    ) {
      return NextResponse.next();
    }

    const signInUrl = new URL("/signin", nextUrl.origin);
    // Preserve the intended destination so we can redirect back after login.
    signInUrl.searchParams.set("callbackUrl", `${pathname}${nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  // ── 4. Authenticated API request — allow the request ──────────────────
  return NextResponse.next();
});

export default function middleware(...args: Parameters<typeof authMiddleware>) {
  const req = args[0] as NextRequest;
  const pathname = req.nextUrl.pathname;

  // Public race GETs are CDN-cacheable and must not invoke Auth.js, which may
  // refresh session cookies even though these responses are completely public.
  if (isPublicRaceApiGet(pathname, req.method)) {
    return NextResponse.next();
  }

  return authMiddleware(...args);
}

export const config = {
  // Auth.js handles /api/auth/* directly through its route handler.
  matcher: ["/api/((?!auth(?:/|$)).*)"],
};
