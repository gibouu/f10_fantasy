"use server";

import getSupabaseClient from "@/db/supabaseClient";

export default async function getUserLeaguePicks(
    leagueId: string,
    userId: string | undefined
) {
    const { supabase } = await getSupabaseClient();

    try {
        if (userId) {
            const { data, error } = await supabase
                .from("picks")
                .select(
                    `
          league_id,
          season,
          round,
          tenth_pick,
          third_pick,
          dnf_pick,
          created_at,
          users (name)
        `
                )
                .eq("league_id", leagueId)
                .eq("user_id", userId);

            if (error) {
                console.error(
                    "Error fetching league race picks:",
                    error.message
                );
                throw error;
            }

            return data;
        } else {
            throw new Error("user id undefined");
        }
    } catch (error) {
        throw error;
    }
}
