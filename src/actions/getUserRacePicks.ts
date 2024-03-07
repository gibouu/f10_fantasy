"use server";

import getSupabaseClient from "@/db/supabaseClient";
import getUser from "./getUser";

export default async function getUserRacePicks(
    leagueId: string,
    season: string,
    round: string
) {
    const { supabase } = await getSupabaseClient();

    try {
        const userId = (await getUser()).id;

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
            .eq("season", season)
            .eq("round", round)
            .eq("user_id", userId);

        if (error) {
            console.error("Error fetching league race picks:", error.message);
            throw error;
        }

        return data;
    } catch (error) {
        throw error;
    }
}
