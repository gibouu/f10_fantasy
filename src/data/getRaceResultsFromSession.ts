import { RaceResultsOpenF1 } from "../../types/f1";

type LatestResultsMap = {
    [key: string]: RaceResultsOpenF1;
};

export default async function getRaceResultsFromSession(session_key: string) {
    const resultsRes = await fetch(
        `https://api.openf1.org/v1/position?session_key=${session_key}`
    );

    if (!resultsRes.ok) {
        throw new Error("Failed to fetch results data");
    }

    let results: RaceResultsOpenF1[] = await resultsRes.json();
    let latestResultsMap: LatestResultsMap = {};

    results.forEach(result => {
        const driverNumber = result.driver_number.toString();
        latestResultsMap[driverNumber] = latestResultsMap[driverNumber]
            ? (new Date(result.date) > new Date(latestResultsMap[driverNumber].date) ? result : latestResultsMap[driverNumber])
            : result;
    });

    let latestResults = Object.values(latestResultsMap);

    await Promise.all(latestResults.map(async (result) => {
        const driverRes = await fetch(
            `https://api.openf1.org/v1/drivers?driver_number=${result.driver_number}&session_key=${session_key}`
        );

        if (driverRes.ok) {
            const driverData = await driverRes.json();
            if (driverData.length > 0) {
                result.driverFullName = driverData[0].full_name;
            }
        }
    }));

    latestResults.sort((a, b) => parseInt(a.position) - parseInt(b.position));

    // Return the results along with the session's status,
    // which is accurately determined based on session window
    return latestResults;
}
