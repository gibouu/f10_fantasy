import { season } from "@/lib/constants";
import { Driver } from "../../types/f1";

type Props = {
    number: string | undefined;
    meetingKey: string | null;
};

export default async function getDriverFromNumber({
    number,
    meetingKey,
}: Props) {
    if (meetingKey) {
        const res = await fetch(
            `https://api.openf1.org/v1/drivers?meeting_key=${meetingKey}&driver_number=${number}`
        );

        if (!res.ok) {
            // This will activate the closest `error.js` Error Boundary
            throw new Error("Failed to fetch data");
        }

        const data = await res.json();

        if (data.length === 0) {
            throw new Error(`No driver found with number ${number}`);
        }

        // Assuming the API returns an array of drivers, sort by session_key to get the latest
        const sortedDrivers = data.sort(
            (a: { session_key: number }, b: { session_key: number }) =>
                b.session_key - a.session_key
        );

        // The first driver in the sorted array is the one with the latest session_key
        const latestDriver = sortedDrivers[0];

        // Return the last name of the driver
        return latestDriver.last_name;
    } else {
        const res = await fetch(
            `http://ergast.com/api/f1/${season}/drivers.json`
        );

        if (!res.ok) {
            throw new Error("Failed to fetch data");
        }

        const data = await res.json();
        const drivers = data.MRData.DriverTable.Drivers;

        const matchingDriver = drivers.find(
            (driver: { permanentNumber: string }) =>
                driver.permanentNumber === number
        );

        if (!matchingDriver) {
            throw new Error(`No driver found with number ${number}`);
        }

        return matchingDriver.familyName;
    }
}
