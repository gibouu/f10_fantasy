import getSupabaseClient from "@/db/supabaseClient";
import getUser from "./getUser";

export default async function getUserLeagues() {
  const { supabase } = await getSupabaseClient();

  const user = await getUser();

  const { data, error } = await supabase
    .from('user_league')
    .select(`
      league_id,
      league (*) 
    `)
    .eq('user_id', user.id); // Filter by the provided user_id

  if (error) throw error;

  const leagues = data

  return leagues
}
