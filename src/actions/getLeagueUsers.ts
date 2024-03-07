"use server"

import getSupabaseClient from "@/db/supabaseClient";

type Props = {
    leagueId: string;
};

export default async function getLeagueUsers({ leagueId }: Props) {
    const { supabase } = await getSupabaseClient();

    const { data, error } = await supabase
        .from("user_league")
        .select(
            `
      users (*) 
    `
        )
        .eq("league_id", leagueId); // Filter by the provided leagueId

    if (error) throw error;

    const users = data;

    return users;
}