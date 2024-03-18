"use client"

import { useEffect, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { calculatePointsForRace } from "@/lib/calculatePoints";
import { Tables } from "../../types/supabase";
import {
    RaceResultsErgast,
    RaceResultsOpenF1,
    SessionStatus,
} from "../../types/f1";
import getRaceResults from "@/data/getRaceResults";
import { Reorder } from "framer-motion";

interface UserPicks {
    tenth_pick_name: string | null;
    third_pick_name: string | null;
    dnf_pick_name: string | null;
}

interface User {
    name: string | null;
}

// Extend the Picks type to include the points property
interface ExtendedPick extends Tables<"picks">, UserPicks {
    users: User | null;
    points?: number; // Making points optional to allow initialization without it
}

type Props = {
    picks: ExtendedPick[];
    initialResults: RaceResultsErgast[] | null;
    raceSessionKey: string | null;
};

export default function LeaguePicks({
    picks,
    initialResults,
    raceSessionKey,
}: Props) {
    const [raceResults, setRaceResults] = useState<RaceResultsOpenF1[]>([]);
    const [status, setStatus] = useState<SessionStatus>("active");
    const [sortedPicks, setSortedPicks] = useState<typeof picks>([]);

    async function fetchRaceResults() {
        if (status === "inactive") {
            return;
        }
        try {
            const { raceResults: newRaceResults, raceStatus: newStatus } =
                await getRaceResults({
                    initial: false,
                    session_key: raceSessionKey,
                });

            setRaceResults((currentResults) => {
                const updatedResultsMap = new Map(
                    currentResults.map((result) => [
                        result.driver_number,
                        result,
                    ])
                );

                newRaceResults.forEach((newResult) => {
                    updatedResultsMap.set(newResult.driver_number, {
                        ...updatedResultsMap.get(newResult.driver_number),
                        ...newResult,
                    });
                });

                return Array.from(updatedResultsMap.values());
            });

            setStatus(newStatus);
        } catch (error) {
            console.error("Failed to fetch qualifying results:", error);
            setRaceResults([]);
            setStatus("inactive");
        }
    }

    // Calculate and sort picks based on the calculated points
    useEffect(() => {
        // Function to asynchronously calculate points and update state
        const calculateAndSortPicks = async () => {
            // Map picks to a new array where points are calculated
            const calculatedPicksPromises = picks.map(async (pick) => {
                const points = await calculatePointsForRace({
                    pick,
                    initialResults,
                    raceResults,
                    sessionKey: raceSessionKey,
                });
                return { ...pick, points: points ?? 0 }; // Use nullish coalescing to fallback to 0 if null
            });

            // Wait for all promises to resolve
            const calculatedPicks = await Promise.all(calculatedPicksPromises);

            // Sort based on the calculated points
            const sortedPicks = calculatedPicks.sort(
                (a, b) => (b.points ?? 0) - (a.points ?? 0)
            );
            setSortedPicks(sortedPicks);
        };

        calculateAndSortPicks();
    }, [picks, raceResults, initialResults, raceSessionKey]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            fetchRaceResults();
        }, 20000);

        if (status === "inactive") {
            clearInterval(intervalId);
        }

        return () => clearInterval(intervalId);
    }, [status, fetchRaceResults]);

    return (
        <Reorder.Group values={sortedPicks} onReorder={setSortedPicks}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>10th Place</TableHead>
                        <TableHead>3rd Place</TableHead>
                        <TableHead>DNF</TableHead>
                        <TableHead>Points</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedPicks.map((pick) => (
                        <Reorder.Item
                            as="tr"
                            key={`${pick.user_id}-${pick.league_id}-${pick.season}-${pick.round}`}
                            value={pick}
                        >
                            <TableCell>{pick.users?.name}</TableCell>
                            <TableCell>{pick.tenth_pick_name}</TableCell>
                            <TableCell>{pick.third_pick_name}</TableCell>
                            <TableCell>{pick.dnf_pick_name}</TableCell>
                            <TableCell>{pick.points}</TableCell>
                        </Reorder.Item>
                    ))}
                </TableBody>
            </Table>
        </Reorder.Group>
    );
}
