import { season } from "@/lib/constants";
import { Driver } from "../../types/f1";

export default async function getDrivers(meeting_key: string | null) {

    if (meeting_key) {
        const res = await fetch(
            `https://api.openf1.org/v1/drivers?meeting_key=${meeting_key}`
        );

        if (!res.ok) {
            // This will activate the closest `error.js` Error Boundary
            throw new Error("Failed to fetch data");
        }

        const data = await res.json();

        // Convert the fields from numbers to strings
        const drivers: Driver[] = data.map((driver: { session_key: number; meeting_key: number; driver_number: number }) => ({
            ...driver,
            session_key: String(driver.session_key),
            meeting_key: String(driver.meeting_key),
            driver_number: String(driver.driver_number),
        }));

        // Group drivers by session_key
        const sessions = drivers.reduce<Record<string, Driver[]>>(
            (acc, driver) => {
                const sessionKey = driver.session_key;
                if (!acc[sessionKey]) {
                    acc[sessionKey] = [];
                }
                acc[sessionKey].push(driver);
                return acc;
            },
            {}
        );

        // To find the latest session key, convert session keys to numbers for comparison
        const latestSessionKey = Math.max(
            ...Object.keys(sessions).map((key) => parseInt(key, 10))
        ).toString();

        // Ensure the latestSessionKey is a string when using it to index the sessions object
        const latestSessionDrivers: Driver[] = sessions[latestSessionKey];

        return latestSessionDrivers;
    } else {
        const res = await fetch(
            `http://ergast.com/api/f1/${season}/drivers.json`
        );

        if (!res.ok) {
            // This will activate the closest `error.js` Error Boundary
            throw new Error("Failed to fetch data");
        }

        const data = await res.json();

        const drivers: Driver[] = data.MRData.DriverTable.Drivers;

        return drivers;
    }
}
