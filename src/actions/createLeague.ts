"use server";

import getSupabaseClient from "@/db/supabaseClient";
import getUser from "./getUser";
import { redirect } from "next/navigation";

export default async function createLeague(leagueName: string) {
    const { supabase } = await getSupabaseClient();

    const { data: league, error: errorCreateLeague } = await supabase
        .from("league")
        .insert({ name: leagueName })
        .select();

    if (errorCreateLeague) throw errorCreateLeague;

    const leagueId = league[0].id;

    try {
        const userId = (await getUser()).id;

        const { error: joinLeagueError } = await supabase
            .from("user_league")
            .insert([{ user_id: userId, league_id: leagueId }]);

        if (joinLeagueError) throw joinLeagueError;

        redirect("/");
    } catch (error) {
        throw error;
    }
}
