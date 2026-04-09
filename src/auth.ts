import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import type { Provider } from "next-auth/providers";

import { db } from "@/lib/db/client";
import { authConfig } from "./auth.config";

// Wrap every adapter method to log the real error on failure.
// Auth.js swallows adapter errors behind a generic "AdapterError" message.
function debugAdapter(adapter: Adapter): Adapter {
  const wrapped = { ...adapter };
  for (const [key, fn] of Object.entries(adapter)) {
    if (typeof fn === "function") {
      (wrapped as Record<string, unknown>)[key] = async (...args: unknown[]) => {
        try {
          return await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
        } catch (err) {
          console.error(`[auth] adapter.${key} failed:`, err);
          throw err;
        }
      };
    }
  }
  return wrapped;
}

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

const nextAuth = NextAuth({
  ...authConfig,

  adapter: debugAdapter(PrismaAdapter(db)),
  providers,

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      return Boolean(user.email ?? user.id);
    },
  },
});

const rawAuth = nextAuth.auth as (...args: any[]) => Promise<any>;

export const { handlers, signIn, signOut } = nextAuth;

export const auth = (async (...args: any[]) => {
  const session = await rawAuth(...args);

  if (!session?.user?.id) {
    return session;
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { sessionValidAfter: true },
  });

  const sessionIssuedAtMs = session.user.sessionIssuedAtMs;

  if (
    user?.sessionValidAfter &&
    typeof sessionIssuedAtMs === "number" &&
    sessionIssuedAtMs < user.sessionValidAfter.getTime()
  ) {
    return null;
  }

  return session;
}) as typeof rawAuth;

// ─────────────────────────────────────────────
// Module augmentation — extend Auth.js types with our custom fields
// ─────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      publicUsername: string | null;
      usernameSet: boolean;
      sessionIssuedAtMs: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    publicUsername?: string | null;
    usernameSet?: boolean;
  }
}
