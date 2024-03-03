import { createClient } from "@supabase/supabase-js";
import { getSession } from "next-auth/react";

export default async function getSupabaseClient(req) {
    const session = await getSession({ req });

    const { supabaseAccessToken } = session;

    console.log(session)

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${supabaseAccessToken}`,
                },
            },
        }
    );

    return supabase;
}
