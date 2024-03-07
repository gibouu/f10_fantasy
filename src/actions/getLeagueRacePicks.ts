"use server";

import getSupabaseClient from "@/db/supabaseClient";
import getDriverFromId from "./getDriverFromId";

export default async function getLeagueRacePicks(leagueId: string, season: string, round: string) {

  const { supabase } = await getSupabaseClient();

  const { data, error } = await supabase
    .from('picks')
    .select(`
      user_id,
      league_id,
      season,
      round,
      tenth_pick,
      third_pick,
      dnf_pick,
      created_at,
      users (name)
    `)
    .eq('league_id', leagueId)
    .eq('season', season)
    .eq('round', round);

  if (error) {
    console.error("Error fetching league race picks:", error.message);
    throw error;
  }

  const populatedPicks = await Promise.all(data.map(async pick => {
    const tenthPlaceDriver = pick.tenth_pick ? await getDriverFromId({ driverId: pick.tenth_pick }) : null;
    const thirdPlaceDriver = pick.third_pick ? await getDriverFromId({ driverId: pick.third_pick }) : null;
    const dnfDriver = pick.dnf_pick ? await getDriverFromId({ driverId: pick.dnf_pick }) : null;

    return {
      ...pick,
      tenth_pick_name: tenthPlaceDriver ? tenthPlaceDriver.familyName : null,
      third_pick_name: thirdPlaceDriver ? thirdPlaceDriver.familyName : null,
      dnf_pick_name: dnfDriver ? dnfDriver.familyName : null,
    };
  }));

  return populatedPicks;
}
