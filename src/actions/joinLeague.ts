"use server";

import getSupabaseClient from "@/db/supabaseClient";
import { redirect } from "next/navigation";
import getUser from "./getUser";

export default async function joinLeague(leagueId: string) {
  const { supabase } = await getSupabaseClient();

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
