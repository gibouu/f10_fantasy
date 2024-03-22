"use client";

import { useEffect, useState } from "react";
import getQualifyingResults from "@/data/getQualifyingResults";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { QualifyingResultOpenF1, SessionStatus } from "../../types/f1";
import { Reorder } from "framer-motion";

type Props = {
    initialResults: QualifyingResultOpenF1[];
    initialStatus: SessionStatus;
    sessionKey: string | null
};

export default function QualifyingTab({
    initialResults,
    initialStatus,
    sessionKey
}: Props) {
    const [qualiResults, setQualiResults] =
        useState<QualifyingResultOpenF1[]>(initialResults);

    const [status, setStatus] = useState<SessionStatus>(initialStatus);

    async function fetchQualifyingResults() {
        if (status === "inactive") {
            return;
        }
        try {
            const { qualiResults: newQualiResults, qualiStatus: newStatus } =
                await getQualifyingResults({
                    initial: false,
                    session_key: sessionKey
                });

            // Update the state with the new results, merging by driver_number
            setQualiResults((currentResults) => {
                const updatedResultsMap = new Map(
                    currentResults.map((result) => [
                        result.driver_number,
                        result,
                    ])
                );

                // Update or add new entries
                newQualiResults.forEach((newResult) => {
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
            setQualiResults([]);
            setStatus("inactive");
        }
    }

    useEffect(() => {
        const intervalId = setInterval(() => {
            fetchQualifyingResults(); // Re-fetch every 20 seconds if session is active
        }, 20000);

        if (status === "inactive") {
            clearInterval(intervalId);
        }

        return () => clearInterval(intervalId); // Cleanup interval on component unmount
    }, [status, fetchQualifyingResults]);

    return (
        <Reorder.Group values={qualiResults} onReorder={setQualiResults}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Position</TableHead>
                        <TableHead>Driver</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {qualiResults.map((result) => (
                        <Reorder.Item
                            as="tr"
                            key={result.driver_number}
                            value={result}
                            dragListener={false}
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
