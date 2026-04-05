import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import type { Provider } from "next-auth/providers";

import { db } from "@/lib/db/client";

// Build provider list at startup — Apple is optional until credentials are set.
const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
];

if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),

  // JWT strategy so we can embed user fields into the token
  // without a DB round-trip on every request.
  session: { strategy: "jwt" },

  providers,

  callbacks: {
    /**
     * signIn — called after OAuth succeeds.
     * Returning `true` allows sign-in; `false` blocks it.
     * The onboarding redirect is handled by middleware, not here,
     * so we simply allow every authenticated user through.
     */
    async signIn({ user }) {
      // Block sign-in for users without a verified email address
      // (Apple can return null email for private relay — allow it anyway
      // since the provider already verified identity).
      return Boolean(user.email ?? user.id);
    },

    /**
     * jwt — persists additional fields from the DB user record into the token.
     * `trigger === "update"` lets client code call `update()` to refresh
     * the session after the user sets their username.
     */
    async jwt({ token, user, trigger, session }) {
      // First sign-in: `user` is the DB record returned by the adapter.
      if (user) {
        token.id = user.id;
        token.publicUsername = user.publicUsername ?? null;
        token.usernameSet = user.usernameSet ?? false;
      }

      // Client called `update(session)` — merge the payload in.
      if (trigger === "update" && session) {
        if (typeof session.publicUsername === "string") {
          token.publicUsername = session.publicUsername;
        }
        if (typeof session.usernameSet === "boolean") {
          token.usernameSet = session.usernameSet;
        }
      }

      return token;
    },

    /**
     * session — shapes what `auth()` / `useSession()` returns to the app.
     * Only expose what the UI actually needs.
     */
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.publicUsername = (token.publicUsername as string | null) ?? null;
        session.user.usernameSet = (token.usernameSet as boolean) ?? false;
      }
      return session;
    },
  },

  pages: {
    signIn: "/signin",
    error: "/signin",
  },
});

// ─────────────────────────────────────────────
// Module augmentation — extend Auth.js types with our custom fields
// ─────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      publicUsername: string | null;
      usernameSet: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    publicUsername?: string | null;
    usernameSet?: boolean;
  }
}
