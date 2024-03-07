"use server";

import getSupabaseClient from "@/db/supabaseClient";
import { redirect } from "next/navigation";
import getUser from "./getUser";

export default async function joinLeague(leagueCode: string) {
    const { supabase } = await getSupabaseClient();

    try {
        const userId = (await getUser()).id;

        const { data, error } = await supabase
            .from("league")
            .select("id")
            .eq("invite_code", leagueCode);

        if (error) throw error;

        const leagueId = data[0].id;

        // Check if the user is already in the league
        const { data: existingMemberships, error: membershipError } =
            await supabase
                .from("user_league")
                .select("*")
                .eq("user_id", userId)
                .eq("league_id", leagueId);

        if (membershipError) throw membershipError;

        // If the user is already in the league, don't try to add them again
        if (existingMemberships.length > 0) {
            redirect("/");
        }

        // If the user is not in the league, add them
        const { error: joinLeagueError } = await supabase
            .from("user_league")
            .insert([{ user_id: userId, league_id: leagueId }]);

        if (joinLeagueError) throw joinLeagueError;

        redirect("/");
    } catch (error) {
        throw error;
    }
}
