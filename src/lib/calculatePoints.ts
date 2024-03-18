import {
    RaceResultsErgast,
    RaceResultsOpenF1,
    RacesResultsErgast,
    RacesResultsOpenF1,
} from "../../types/f1";
import { dnf_values, f1PointsSystem, season } from "./constants";
import { Tables } from "../../types/supabase";

interface Pick {
    tenth_pick: string | null;
    third_pick: string | null;
    dnf_pick: string | null;
    user_id: string;
    league_id: string;
    season: number;
    round: number;
    created_at: string;
    users: {
        name: string | null;
    } | null;
}

type IndividualProps = {
    pick: Pick;
    raceResults: RaceResultsOpenF1[] | null;
    initialResults: RaceResultsErgast[] | null;
    sessionKey: string | null;
};

type LeagueProps = {
    userPicks: Tables<"picks">[];
    initialResults: RacesResultsErgast[];
    racesResults: RacesResultsOpenF1[] | null;
};

// NOTE: DNF FOR NOW WILL BE IF THE LAST ENTRY IN LAPS HAS NO DURATION

// Calculate points for a single pick
export async function calculatePointsForRace({
    pick,
    raceResults,
    initialResults,
    sessionKey,
}: IndividualProps) {
    let points = 0;

    if (initialResults && raceResults?.length === 0) {
        const thirdPlaceDriverNumber = initialResults.find(
            (initialResults) => initialResults.position === "3"
        )?.number;
        // Ensure we have a non-null value before comparison
        if (pick.third_pick && pick.third_pick === thirdPlaceDriverNumber) {
            points += 5; // 5 points for correct 3rd place
        }

        // Filter out results where positionText indicates a finish, then map to driver IDs
        const dnfDriverNumber = initialResults
            .filter((result) => dnf_values.includes(result.positionText))
            .map((result) => result.number);
        // Check for non-null before using in includes
        if (pick.dnf_pick && dnfDriverNumber.includes(pick.dnf_pick)) {
            points += 7; // 7 points for correct DNF prediction
        }

        // Handling for 10th place prediction

        const predictedDriverResult = initialResults.find(
            (result) => result.number === pick.tenth_pick
        );
        if (predictedDriverResult) {
            if (
                pick.tenth_pick === predictedDriverResult.number &&
                dnf_values.includes(predictedDriverResult.positionText)
            ) {
                // Deduct points if the predicted 10th place driver did not finish
                points -= 10;
            } else {
                // Calculate the distance from the actual 10th place
                const predictedPosition = parseInt(
                    predictedDriverResult.position,
                    10
                );
                if (predictedPosition) {
                    const distance = Math.abs(predictedPosition - 10);
                    // Invert the distance into points - closer predictions are worth more, with a max of 10 points
                    // You can adjust the scoring logic as needed
                    const distancePoints = f1PointsSystem[distance];
                    points += distancePoints;
                } else {
                    return null;
                }
            }
        }
    } else if (raceResults && raceResults?.length !== 0 && sessionKey) {
        const thirdPlaceDriverNumber = raceResults.find(
            (raceResults) => raceResults.position === "3"
        )?.driver_number;
        // Ensure we have a non-null value before comparison
        if (pick.third_pick && pick.third_pick === thirdPlaceDriverNumber) {
            points += 5; // 5 points for correct 3rd place
        }

        // Find if the last lap of dnf picked driver and see if their last lap time is null
        const resDNF = await fetch(
            `https://api.openf1.org/v1/laps?session_key=${sessionKey}&driver_number=${pick.dnf_pick}`
        );

        if (!resDNF.ok) {
            return null;
        }

        const dataDNF = await resDNF.json();

        const last_lapDNF = dataDNF[dataDNF.length - 1];

        // Check for non-null before using in includes
        if (pick.dnf_pick && last_lapDNF.lap_duration === null) {
            points += 7; // 7 points for correct DNF prediction
        }

        // Handling for 10th place prediction
        const predictedDriverResult = raceResults.find(
            (result) => result.driver_number === pick.tenth_pick
        );

        const res10 = await fetch(
            `https://api.openf1.org/v1/laps?session_key=${sessionKey}&driver_number=${pick.tenth_pick}`
        );

        if (!res10.ok) {
            return null;
        }

        const data10 = await res10.json();

        const last_lap10 = data10[data10.length - 1];

        if (predictedDriverResult) {
            if (
                pick.tenth_pick === predictedDriverResult.driver_number &&
                last_lap10.lap_duration === null
            ) {
                // Deduct points if the predicted 10th place driver did not finish
                points -= 10;
            } else {
                // Calculate the distance from the actual 10th place
                const predictedPosition = parseInt(
                    predictedDriverResult.position,
                    10
                );
                if (predictedPosition) {
                    const distance = Math.abs(predictedPosition - 10);
                    // Invert the distance into points - closer predictions are worth more, with a max of 10 points
                    // You can adjust the scoring logic as needed
                    const distancePoints = f1PointsSystem[distance];
                    points += distancePoints;
                } else {
                    return null;
                }
            }
        }
    }

    return points;
}

// Calculate points for a single pick
export async function calculatePointsForStandings({
    userPicks,
    initialResults,
    racesResults,
}: LeagueProps) {
    let totalPoints = 0;

    if (initialResults && racesResults?.length === 0) {
        for (const race of initialResults) {
            const racePicks = userPicks.filter(
                (pick) =>
                    pick.round === parseInt(race.round) &&
                    pick.season === parseInt(race.season)
            );

            let results = race.Results;

            if (race.Results.length !== 20) {
                const res = await fetch(
                    `https://ergast.com/api/f1/${season}/${race.round}/results.json`
                );

                if (res.ok) {
                    const data = await res.json();
                    results = data.MRData.RaceTable.Races[0].Results;
                }
            }
            for (const pick of racePicks) {
                // Now calculate the points for each pick using a modified version of your existing logic
                let points = 0;

                const thirdPlaceDriverId = results.find(
                    (result) => result.position === "3"
                )?.number;
                if (pick.third_pick && pick.third_pick === thirdPlaceDriverId) {
                    points += 5; // Points for correct 3rd place
                }

                // Filter out results where positionText indicates a finish, then map to driver IDs
                const dnfDriverIds = results
                    .filter((result) =>
                        dnf_values.includes(result.positionText)
                    )
                    .map((result) => result.Driver.driverId);
                if (pick.dnf_pick && dnfDriverIds.includes(pick.dnf_pick)) {
                    points += 7; // Points for correct DNF prediction
                }

                // Handling for 10th place prediction
                const predictedDriverResult = results.find(
                    (result) => result.number === pick.tenth_pick
                );

                if (predictedDriverResult) {
                    if (
                        pick.tenth_pick === predictedDriverResult.number &&
                        dnf_values.includes(predictedDriverResult.positionText)
                    ) {
                        // Deduct points if the predicted 10th place driver did not finish
                        points -= 10;
                    } else {
                        // Calculate the distance from the actual 10th place
                        const predictedPosition = parseInt(
                            predictedDriverResult.position,
                            10
                        );
                        if (predictedPosition) {
                            const distance = Math.abs(predictedPosition - 10);
                            // Invert the distance into points - closer predictions are worth more, with a max of 10 points
                            // You can adjust the scoring logic as needed
                            const distancePoints = f1PointsSystem[distance];
                            points += distancePoints;
                        } else {
                            return null;
                        }
                    }
                }
                // Add points for this race to the total
                totalPoints += points;
            }
        }
    } else if (racesResults && racesResults?.length !== 0) {
        let index = 0;
        for (const race of racesResults) {
            const racePicks = userPicks.filter(
                (pick) =>
                    pick.round === index && pick.season === parseInt(race.year)
            );

            for (const pick of racePicks) {
                // Now calculate the points for each pick using a modified version of your existing logic
                let points = 0;

                const results = race.results;

                const thirdPlaceDriverId = results.find(
                    (result) => result.position === "3"
                )?.driver_number;
                if (pick.third_pick && pick.third_pick === thirdPlaceDriverId) {
                    points += 5; // Points for correct 3rd place
                }

                // Find if the last lap of dnf picked driver and see if their last lap time is null
                const resDNF = await fetch(
                    `https://api.openf1.org/v1/laps?session_key=${race.session_key}&driver_number=${pick.dnf_pick}`
                );

                if (!resDNF.ok) {
                    return null;
                }

                const dataDNF = await resDNF.json();

                const last_lapDNF = dataDNF[dataDNF.length - 1];

                // Check for non-null before using in includes
                if (pick.dnf_pick && last_lapDNF.lap_duration === null) {
                    points += 7; // 7 points for correct DNF prediction
                }

                // Handling for 10th place prediction
                const predictedDriverResult = race.results.find(
                    (result) => result.driver_number === pick.tenth_pick
                );

                const res10 = await fetch(
                    `https://api.openf1.org/v1/laps?session_key=${race.session_key}&driver_number=${pick.tenth_pick}`
                );

                if (!res10.ok) {
                    return null;
                }

                const data10 = await res10.json();

                const last_lap10 = data10[data10.length - 1];

                if (predictedDriverResult) {
                    if (
                        pick.tenth_pick ===
                            predictedDriverResult.driver_number &&
                        last_lap10.lap_duration === null
                    ) {
                        // Deduct points if the predicted 10th place driver did not finish
                        points -= 10;
                    } else {
                        // Calculate the distance from the actual 10th place
                        const predictedPosition = parseInt(
                            predictedDriverResult.position,
                            10
                        );
                        if (predictedPosition) {
                            const distance = Math.abs(predictedPosition - 10);
                            // Invert the distance into points - closer predictions are worth more, with a max of 10 points
                            // You can adjust the scoring logic as needed
                            const distancePoints = f1PointsSystem[distance];
                            points += distancePoints;
                        } else {
                            return null;
                        }
                    }
                }
                // Add points for this race to the total
                totalPoints += points;
                index++;
            }
        }
    }

    return totalPoints;
}
