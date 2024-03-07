import getUserLeaguePicks from "@/actions/getUserLeaguePicks";
import { RacesResults, Result } from "../../types/f1";
import { dnf_values, f1PointsSystem } from "./constants";

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
    results: Result[] | null;
};

type LeagueProps = {
    leagueId: string,
    userId: string | undefined,
    racesResults: RacesResults[] | null;
}

type ResultProps = {
    predictedDriverResult: Result | null;
}

function calculateDistancePoints({ predictedDriverResult }: ResultProps) {
    // Assuming `predictedDriverResult` is now a single object or null.
    if (!predictedDriverResult) return 0; // Early return if null

    const predictedPosition = parseInt(predictedDriverResult.position, 10);

    if (!isNaN(predictedPosition)) {
        const distance = Math.abs(predictedPosition - 10);
        const distancePoints = distance < f1PointsSystem.length ? f1PointsSystem[distance] : 0; // Ensure distance is within array bounds
        return distancePoints;
    } else {
        return 0;
    }
}

// Calculate points for a single pick
export function calculatePointsForPick({ pick, results }: IndividualProps) {
    let points = 0;

    if (results) {
        const thirdPlaceDriverId = results.find(
            (result) => result.position === "3"
        )?.Driver.driverId;
        // Ensure we have a non-null value before comparison
        if (pick.third_pick && pick.third_pick === thirdPlaceDriverId) {
            points += 5; // 5 points for correct 3rd place
        }

        // Filter out results where positionText indicates a finish, then map to driver IDs
        const dnfDriverIds = results
            .filter((result) => dnf_values.includes(result.positionText))
            .map((result) => result.Driver.driverId);
        // Check for non-null before using in includes
        if (pick.dnf_pick && dnfDriverIds.includes(pick.dnf_pick)) {
            points += 7; // 10 points for correct DNF prediction
        }

        // Handling for 10th place prediction
        const predictedDriverResult = results.find(
            (result) => result.Driver.driverId === pick.tenth_pick
        );
        if (predictedDriverResult) {
            if (
                pick.tenth_pick === predictedDriverResult.Driver.driverId &&
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
                if(predictedPosition){
                    const distance = Math.abs(predictedPosition - 10);
                    // Invert the distance into points - closer predictions are worth more, with a max of 10 points
                    // You can adjust the scoring logic as needed
                    const distancePoints = f1PointsSystem[distance]
                    points += distancePoints;
                } else {
                    return null
                }
               
            }
        }
    }

    return points;
}

// Calculate points for a single pick
export async function calculatePointsForStandings({ leagueId, userId, racesResults }: LeagueProps) {
    
    const picks = await getUserLeaguePicks(leagueId, userId);
    
    let totalPoints = 0;

    if (racesResults && picks) {
        racesResults.forEach((race) => {
            const racePicks = picks.filter(pick => pick.round === parseInt(race.round) && pick.season === parseInt(race.season));
            racePicks.forEach((pick) => {
                // Now calculate the points for each pick using a modified version of your existing logic
                let points = 0;
                const results = race.Results;

                const thirdPlaceDriverId = results.find(result => result.position === "3")?.Driver.driverId;
                if (pick.third_pick && pick.third_pick === thirdPlaceDriverId) {
                    points += 5; // Points for correct 3rd place
                }

                const dnfDriverIds = results.filter(result => dnf_values.includes(result.positionText)).map(result => result.Driver.driverId);
                if (pick.dnf_pick && dnfDriverIds.includes(pick.dnf_pick)) {
                    points += 7; // Points for correct DNF prediction
                }

                // Handling for 10th place prediction
                const predictedDriverResult = results.find(result => result.Driver.driverId === pick.tenth_pick);
                if (predictedDriverResult) {
                    // Adjust your logic here as per the original calculation
                    // Assuming your logic for calculating points based on the position
                    // For simplicity, let's just add points if the pick matches
                    points += calculateDistancePoints({predictedDriverResult});
                }

                // Add points for this race to the total
                totalPoints += points;
            });
        })
    }

    return totalPoints;
}
