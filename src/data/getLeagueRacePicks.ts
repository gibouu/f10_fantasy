import getSupabaseClient from "@/db/supabaseClient";
import { season } from "@/lib/constants";
import getDriverFromNumber from "./getDriverFromNumber";

export default async function getLeagueRacePicks(
    leagueId: string,
    round: string,
    meetingKey: string | null
) {
    const { supabase } = await getSupabaseClient();

    const { data, error } = await supabase
        .from("picks")
        .select(
            `
      user_id,
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
        .eq("round", round);

    if (error) {
        console.error("Error fetching league race picks:", error.message);
        throw error;
    }

    const populatedPicks = await Promise.all(
        data.map(async (pick) => {
            const tenthPlaceDriver = pick.tenth_pick
                ? await getDriverFromNumber({
                      number: pick.tenth_pick,
                      meetingKey: meetingKey,
                  })
                : null;
            const thirdPlaceDriver = pick.third_pick
                ? await getDriverFromNumber({
                      number: pick.third_pick,
                      meetingKey: meetingKey,
                  })
                : null;
            const dnfDriver = pick.dnf_pick
                ? await getDriverFromNumber({
                      number: pick.dnf_pick,
                      meetingKey: meetingKey,
                  })
                : null;

            return {
                ...pick,
                tenth_pick_name: tenthPlaceDriver ? tenthPlaceDriver : null,
                third_pick_name: thirdPlaceDriver ? thirdPlaceDriver : null,
                dnf_pick_name: dnfDriver ? dnfDriver : null,
            };
        })
    );

    return populatedPicks;
}
