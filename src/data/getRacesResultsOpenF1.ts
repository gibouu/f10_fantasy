import { season } from "@/lib/constants";
import { RacesResultsOpenF1, SessionStatus } from "../../types/f1";
import getRaceResultsFromSession from "./getRaceResultsFromSession";

const convertToLocalTime = (dateString: string, gmtOffset: string): Date => {
    const [hours, minutes] = gmtOffset.startsWith("+")
        ? gmtOffset.substring(1).split(":").map(Number)
        : gmtOffset.split(":").map(Number);
    const offsetTotalMinutes = hours * 60 + minutes;
    const date = new Date(dateString);
    date.setUTCMinutes(date.getUTCMinutes() + offsetTotalMinutes); // Correctly adjust to local time
    return date;
};

export default async function getRacesResultsOpenF1() {
    const res = await fetch(
        `https://api.openf1.org/v1/sessions?session_type=Race&year=${season}`
    );

    if (!res.ok) {
        throw new Error("Failed to fetch data");
    }

    const races: RacesResultsOpenF1[]= await res.json();

    if (races.length === 0) {
        return { races: [], status: "No data available" };
    }

    await Promise.all(
        races.map(async (race) => {
            const raceResults = await getRaceResultsFromSession(
                race.session_key
            );
            race.results = raceResults;
        })
    );

    // Initialize status
    let status: SessionStatus = "inactive";

    // Check if the last session is currently active
    const lastRace = races[races.length - 1];
    const currentTime = new Date();
    const startTime = convertToLocalTime(
        lastRace.date_start,
        lastRace.gmt_offset
    );
    const endTime = convertToLocalTime(lastRace.date_end, lastRace.gmt_offset);

    // Check if current time is within the session start and end times
    if (currentTime >= startTime && currentTime <= endTime) {
        status = "active"; // Session is currently active
    }

    return { racesResults: races, racesStatus: status };
}
