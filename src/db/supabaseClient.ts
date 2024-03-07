import { options } from "@/app/api/auth/[...nextauth]/options";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { Database } from "../../types/supabase";

export default async function getSupabaseClient() {
    const session = await getServerSession(options);

    const supabaseAccessToken = session?.supabaseAccessToken;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    
    const supabase = createClient<Database>(
        supabaseUrl,
        supabaseAnonKey,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${supabaseAccessToken}`,
                },
            },
        }
    );

    return {supabase, session};
}
