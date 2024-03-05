"use server";

import getSupabaseClient from "@/db/supabaseClient";


export default async function createLeague(leagueName: string) {
  const { supabase, session } = await getSupabaseClient();

  if (!session) throw new Error("Not Authorized");

  const { data: league, error: errorCreateLeague } = await supabase
    .from("leagues")
    .insert([{ name: leagueName }])
    .select();

  if (errorCreateLeague) throw errorCreateLeague;

  const leagueId = league[0].id

  return leagueId
}
