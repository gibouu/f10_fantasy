"use server"

import { season } from "@/lib/constants";
import { RacesResults } from "../../types/f1";

export default async function getRacesResults() {
    const res = await fetch(`https://ergast.com/api/f1/${season}/results.json`);

    if (!res.ok) {
        // This will activate the closest `error.js` Error Boundary
        throw new Error('Failed to fetch data');
    }

    const data = await res.json();

    // Check if the Races array is empty or not
    if (data.MRData.RaceTable.Races.length === 0) {
        return null; // Return null to signify no data is available
    }

    const races: RacesResults[] = data.MRData.RaceTable.Races;

    return races;
}
