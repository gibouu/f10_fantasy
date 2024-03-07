"use server";

import getSupabaseClient from "@/db/supabaseClient";
import getUser from "./getUser";
import { revalidatePath } from "next/cache";
import getRaceDetails from "./getRaceDetails";

interface Pick {
    keyValue: string;
    driverId: string | null;
}

type Props = {
    leagueId: string;
    season: string;
    round: string;
    pick: Pick;
};

export default async function addPicks({
    leagueId,
    season,
    round,
    pick,
}: Props) {
    const { supabase } = await getSupabaseClient();

    try {
        const userId = (await getUser()).id;

        const race = await getRaceDetails({ season, round });

        if (race) {
            const dateString = race.date;
            const timeString = race.time;

            // Combine the date and time strings and create a Date object
            const eventDateTime = new Date(dateString + "T" + timeString);

            // Get the current date and time
            const now = new Date();

            // Calculate the difference in milliseconds between the event date time and now
            const diff = eventDateTime.getTime() - now.getTime();

            // Check if the difference is greater than or equal to 10 minutes (in milliseconds)
            const tenMinutesInMilliseconds = 10 * 60 * 1000; // 10 minutes * 60 seconds per minute * 1000 milliseconds per second

            if (diff >= tenMinutesInMilliseconds) {
                // Define the updateObject with a flexible type that allows dynamic properties
                const updateObject: {
                    league_id: string;
                    user_id: string;
                    season: number;
                    round: number;
                    [key: string]: string | number | null; // This line allows dynamic properties
                } = {
                    league_id: leagueId,
                    user_id: userId,
                    season: parseInt(season, 10), //convert to number to match db
                    round: parseInt(round, 10), //convert to number to match db
                };

                // Dynamically set the appropriate pick field based on keyValue
                switch (pick.keyValue) {
                    case "tenth_pick":
                        updateObject.tenth_pick = pick.driverId;
                        break;
                    case "third_pick":
                        updateObject.third_pick = pick.driverId;
                        break;
                    case "dnf_pick":
                        updateObject.dnf_pick = pick.driverId;
                        break;
                }

                const { error } = await supabase
                    .from("picks")
                    .upsert(updateObject)
                    .select();

                if (error) throw error;

                revalidatePath("/");
            } else {
                throw new Error("Too late lil bro")
            }
        }
    } catch (error) {
        throw error;
    }
}
