import type { NextAuthConfig } from "next-auth";

/**
 * Minimal Auth.js config for the Edge middleware.
 *
 * Must NOT import Prisma, database clients, or Node.js-only modules —
 * the middleware runs on the Vercel Edge Runtime which has a 1 MB size limit.
 * Providers and the adapter are added only in the full `auth.ts` config.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },

  providers: [],

  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.publicUsername = (user as { publicUsername?: string | null }).publicUsername ?? null;
        token.usernameSet = (user as { usernameSet?: boolean }).usernameSet ?? false;
      }

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

    session({ session, token }) {
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
};
