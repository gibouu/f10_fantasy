import { options } from "@/app/api/auth/[...nextauth]/options";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { Database } from "../../types/supabase";

export default async function getSupabaseClient() {
    const session = await getServerSession(options);

    const supabaseAccessToken = session?.supabaseAccessToken;
    
    const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
