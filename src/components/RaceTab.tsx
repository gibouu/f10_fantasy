"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { RaceResultsOpenF1, SessionStatus } from "../../types/f1";
import { Reorder } from "framer-motion";
import { useEffect, useState } from "react";
import getRaceResults from "@/data/getRaceResults";

type Props = {
    initialResults: RaceResultsOpenF1[];
    initialStatus: SessionStatus;
    sessionKey: string | null;
};

export default function RaceTab({ initialResults, initialStatus, sessionKey }: Props) {
    const [raceResults, setRaceResults] =
        useState<RaceResultsOpenF1[]>(initialResults);

    const [status, setStatus] = useState<SessionStatus>(initialStatus);

    async function fetchRaceResults() {
        if (status === "inactive") {
            return;
        }
        try {
            const { raceResults: newRaceResults, raceStatus: newStatus } =
                await getRaceResults({
                    initial: false,
                    session_key: sessionKey
                });

            // Update the state with the new results, merging by driver_number
            setRaceResults((currentResults) => {
                const updatedResultsMap = new Map(
                    currentResults.map((result) => [
                        result.driver_number,
                        result,
                    ])
                );

                // Update or add new entries
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
            console.error("Failed to fetch race results:", error);
            setRaceResults([]);
            setStatus("inactive");
        }
    }

    useEffect(() => {
        const intervalId = setInterval(() => {
            fetchRaceResults(); // Re-fetch every 20 seconds if session is active
        }, 20000);

        if (status === "inactive") {
            clearInterval(intervalId);
        }

        return () => clearInterval(intervalId); // Cleanup interval on component unmount
    }, [status, fetchRaceResults]); // Re-run effect if `season` prop changes

    return (
        <Reorder.Group values={raceResults} onReorder={setRaceResults}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Position</TableHead>
                        <TableHead>Driver</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {raceResults?.map((result) => (
                        <Reorder.Item
                            as="tr"
                            key={result.driver_number}
                            value={result}
                        >
                            <TableCell>{result.position}</TableCell>
                            <TableCell>{result.driverFullName}</TableCell>
                        </Reorder.Item>
                    ))}
                </TableBody>
            </Table>
        </Reorder.Group>
    );
}
