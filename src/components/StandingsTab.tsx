"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { calculatePointsForStandings } from "@/lib/calculatePoints";
import { Tables } from "../../types/supabase";
import { useEffect, useState } from "react";
import {
    RacesResultsErgast,
    RacesResultsOpenF1,
    SessionStatus,
} from "../../types/f1";
import { Reorder } from "framer-motion";
import getRacesResultsOpenF1 from "@/data/getRacesResultsOpenF1";
import { Skeleton } from "./ui/skeleton";

interface Scores {
    users: Tables<"users"> | null;
    points?: number;
}

interface User {
    users: Tables<"users"> | null;
}

type Props = {
    leagueId: string;
    users: User[];
    initialResults: RacesResultsErgast[];
    picks: Tables<"picks">[];
};

export default function StandingsTab({ users, initialResults, picks }: Props) {
    const [racesResults, setRacesResults] = useState<RacesResultsOpenF1[]>([]);
    const [status, setStatus] = useState<SessionStatus>("active");
    // Sort users by score
    const [sortedUsers, setSortedUsers] = useState<Scores[]>([]);

    async function fetchRaceResults() {
        console.log(status);
        if (status === "inactive") {
            return;
        }
        try {
            const { racesResults: newRacesResults, racesStatus: newStatus } =
                await getRacesResultsOpenF1();
            console.log(newStatus);

            if (newStatus && newStatus === "active") {
                setRacesResults(newRacesResults);
                setStatus(newStatus);
            } else if (newStatus) {
                setStatus("inactive");
            }
        } catch (error) {
            console.error("Failed to fetch qualifying results:", error);
            setRacesResults([]);
            setStatus("inactive");
        }
    }

    // Calculate and sort picks based on the calculated points
    useEffect(() => {
        // Function to asynchronously calculate points and update state
        const calculateAndSortPicks = async () => {
            // Map picks to a new array where points are calculated
            const calculatedPicksPromises = users.map(async (user) => {
                const userPicks = picks.filter(
                    (pick) => pick.user_id === user.users?.id
                );

                const points = await calculatePointsForStandings({
                    userPicks,
                    initialResults,
                    racesResults,
                });
                return { ...user, points: points ?? 0 }; // Use nullish coalescing to fallback to 0 if null
            });

            // Wait for all promises to resolve
            const calculatedPicks = await Promise.all(calculatedPicksPromises);

            // Sort based on the calculated points
            const sortedPicks = calculatedPicks.sort(
                (a, b) => (b.points ?? 0) - (a.points ?? 0)
            );
            setSortedUsers(sortedPicks);
        };

        calculateAndSortPicks();
    }, [picks, racesResults, initialResults, users]);

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
        <div>
            <div>Standings</div>
            {sortedUsers.length === 0 ? (
                <div>
                    <Skeleton className="w-full h-48" />
                </div>
            ) : (
                <Reorder.Group values={sortedUsers} onReorder={setSortedUsers}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Player</TableHead>
                                <TableHead>Points</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedUsers.map((user) => (
                                <Reorder.Item
                                    as="tr"
                                    key={user.users?.id}
                                    value={user}
                                >
                                    <TableCell>{user.users?.name}</TableCell>
                                    <TableCell>{user.points}</TableCell>
                                </Reorder.Item>
                            ))}
                        </TableBody>
                    </Table>
                </Reorder.Group>
            )}
        </div>
    );
}
