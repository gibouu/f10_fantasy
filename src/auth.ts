import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import type { Provider } from "next-auth/providers";

import { db } from "@/lib/db/client";
import { authConfig } from "./auth.config";

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
  ...authConfig,

  adapter: PrismaAdapter(db),
  providers,

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      return Boolean(user.email ?? user.id);
    },
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
