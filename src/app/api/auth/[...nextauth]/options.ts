import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { Adapter } from "next-auth/adapters";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import jwt from "jsonwebtoken";

export const options: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        }),
    ],
    adapter: SupabaseAdapter({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        secret: process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? "",
    }) as Adapter,
    secret: process.env.NEXTAUTH_SECRET as string,
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async session({ session, token }) {
            if (session?.user) {
                session.user.id = token.sub;
            }
            const signingSecret = process.env.SUPABASE_JWT_SECRET;
            if (signingSecret) {
                const payload = {
                    aud: "authenticated",
                    exp: Math.floor(new Date(session.expires).getTime() / 1000),
                    sub: session.user.id,
                    email: session.user.email,
                    role: "authenticated",
                };
                session.supabaseAccessToken = jwt.sign(payload, signingSecret);
            }
            return session;
        },
    },
};
