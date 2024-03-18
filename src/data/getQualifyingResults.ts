import { season } from "@/lib/constants";
import { QualifyingResultOpenF1, SessionStatus } from "../../types/f1";

type Props = {
    initial: boolean; // Indicates if this is the initial fetch
    session_key: string | null;
};

// Define a type for the map to resolve the TypeScript error
type LatestResultsMap = {
    [key: string]: QualifyingResultOpenF1;
};

const convertToLocalTime = (dateString: string, gmtOffset: string): Date => {
    const [hours, minutes] = gmtOffset.split(':').map(Number);
    const offsetTotalMinutes = hours * 60 + minutes;
    const date = new Date(dateString);
    date.setUTCMinutes(date.getUTCMinutes() + offsetTotalMinutes); // Correctly adjust to local time
    return date;
};

export default async function getQualifyingResults({ initial, session_key }: Props) {
    const sessionRes = await fetch(
        `https://api.openf1.org/v1/sessions?session_key=${session_key}session_name=Qualifying&year=${season}`
    );

    if (!sessionRes.ok) {
        throw new Error("Failed to fetch session data");
    }

    const sessionData = await sessionRes.json();
    const session = sessionData[0]; // Assuming there's only one qualifying session

    if (!session || !session.session_key) {
        return { qualiResults: [], qualiStatus: 'inactive' as SessionStatus };
    }

    const startTime = convertToLocalTime(session.date_start, session.gmt_offset);
    const endTime = convertToLocalTime(session.date_end, session.gmt_offset);
    const currentTime = new Date();

    // Determine the session status based on current time and session window
    let qualiStatus: SessionStatus = (currentTime >= startTime && currentTime <= endTime) ? 'active' : 'inactive';

    // If the session is inactive and it's not an initial fetch, return early with status
    if (qualiStatus === 'inactive' && !initial) {
        return { qualiResults: [], qualiStatus };
    }

    // Proceed with fetching the session results regardless of initial flag,
    // but keep the determined status accurate according to the session window
    const resultsRes = await fetch(
        `https://api.openf1.org/v1/position?session_key=${session.session_key}`
    );

    if (!resultsRes.ok) {
        throw new Error("Failed to fetch results data");
    }

    let results: QualifyingResultOpenF1[] = await resultsRes.json();
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
            `https://api.openf1.org/v1/drivers?driver_number=${result.driver_number}&session_key=${session.session_key}`
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
    return { qualiResults: latestResults, qualiStatus };
}
