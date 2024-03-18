import getSupabaseClient from "@/db/supabaseClient";
import getLeagueUsers from "./getLeagueUsers";
import { Tables } from "../../types/supabase";

type Props = {
    leagueId: string;
};

export default async function getLeaguePicks({ leagueId }: Props) {
    const users = await getLeagueUsers({ leagueId });
    const { supabase } = await getSupabaseClient();

    let allPicks: Tables<"picks">[] = [];

    for (const userContainer of users) {
        if (userContainer.users) {
            const userId = userContainer.users.id;
            const { data: picks, error } = await supabase
                .from('picks')
                .select('*')
                .eq('user_id', userId);

            if (error) {
                console.error('Error fetching picks for user:', userId, error);
                continue; // Skip this iteration on error
            }

            // Flatten the array by spreading the picks into allPicks
            allPicks = [...allPicks, ...picks];
        }
    }

    // Since allPicks is now a flat array of picks, we can return it directly
    return { users, picks: allPicks};
}
