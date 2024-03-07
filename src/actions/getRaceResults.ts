"use server"

import { season } from "@/lib/constants";
import { Result } from "../../types/f1";

type Props = {
    round: string;
}

export default async function getRaceResults({ round }: Props) {
    const res = await fetch(`https://ergast.com/api/f1/${season}/${round}/results.json`);

    if (!res.ok) {
        // This will activate the closest `error.js` Error Boundary
        throw new Error('Failed to fetch data');
    }

    const data = await res.json();

    // Check if the Races array is empty or not
    if (data.MRData.RaceTable.Races.length === 0) {
        return null; // Return null to signify no data is available
    }

    const races: Result[] = data.MRData.RaceTable.Races[0].Results;

    return races;
}
