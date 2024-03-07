"use server";

import { RaceEvent } from "../../types/f1";

export default async function getRacesSchedule() {
    //const res = await fetch('https://api.openf1.org/v1/sessions?session_type=Race&year=2024')
    const res = await fetch("http://ergast.com/api/f1/2024.json");

    if (!res.ok) {
        // This will activate the closest `error.js` Error Boundary
        throw new Error("Failed to fetch data");
    }

    const data = await res.json();
    const races: RaceEvent[] = data.MRData.RaceTable.Races;

    return races;
}
