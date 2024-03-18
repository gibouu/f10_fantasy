import { RaceEvent } from "../../types/f1";
import getMeetingKey from "./getMeetingKey";
import getQualifyingSessionKey from "./getQualifyingSessionKey";
import getRaceSessionKey from "./getRaceSessionKey";

const getCurrentUTCTime = () => {
    const now = new Date();
    // Convert current time to UTC
    const utcNow = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            now.getUTCHours(),
            now.getUTCMinutes(),
            now.getUTCSeconds()
        )
    );
    return utcNow;
};

export default async function getRacesSchedule() {
    //const res = await fetch('https://api.openf1.org/v1/sessions?session_type=Race&year=2024')
    const res = await fetch("http://ergast.com/api/f1/2024.json");

    if (!res.ok) {
        // This will activate the closest `error.js` Error Boundary
        throw new Error("Failed to fetch data");
    }

    const data = await res.json();
    const races: RaceEvent[] = data.MRData.RaceTable.Races;

    // Map each race to a promise that fetches its session key using both date and time
    const racesWithSessionKeyPromises = races.map(async (race) => {
        // Convert race date and time to a Date object, assuming race.date is in YYYY-MM-DD format and race.time in HH:MM:SS format
        const raceDateTime = new Date(`${race.date}T${race.time}Z`); // The 'Z' denotes UTC time
        const qualifyingDateTime = new Date(
            `${race.Qualifying.date}T${race.Qualifying.time}Z`
        );

        // Get the current time in UTC for comparison
        const currentUTCTime = getCurrentUTCTime();

        if (
            currentUTCTime <= raceDateTime ||
            currentUTCTime <= qualifyingDateTime
        ) {
            // If the race or qualifying is in the future compared to the user's current time, do not call the API
            return {
                ...race,
                openF1RaceKey: null,
                openF1QualifyingKey: null,
                openF1MeetingKey: null,
            };
        }

        const raceSessionKey = await getRaceSessionKey({
            year: race.season,
            date: race.date,
            time: race.time,
        });
        const qualifyingSessionKey = await getQualifyingSessionKey({
            year: race.season,
            date: race.Qualifying.date,
            time: race.Qualifying.time,
        });
        const meetingKey = await getMeetingKey({
            year: race.season,
            raceName: race.raceName,
        });
        return {
            ...race,
            openF1RaceKey: raceSessionKey,
            openF1QualifyingKey: qualifyingSessionKey,
            openF1MeetingKey: meetingKey,
        };
    });

    // Wait for all promises to resolve
    const racesWithSessionKeys = await Promise.all(racesWithSessionKeyPromises);

    return racesWithSessionKeys;
}
