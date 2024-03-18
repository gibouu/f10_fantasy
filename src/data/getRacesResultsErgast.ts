import { season } from "@/lib/constants";
import { RacesResultsErgast } from "../../types/f1";

export default async function getRacesResultsErgast() {
    const res = await fetch(`https://ergast.com/api/f1/${season}/results.json`);

    if (!res.ok) {
        // This will activate the closest `error.js` Error Boundary
        throw new Error('Failed to fetch data');
    }

    const data = await res.json();

    // Check if the Races array is empty or not
    if (data.MRData.RaceTable.Races.length === 0) {
        return []; // Return empty to signify no data is available
    }

    const races: RacesResultsErgast[] = data.MRData.RaceTable.Races;

    return races;
    
}