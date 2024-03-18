type Props = {
    year: string;
    date: string;
    time: string;
}

export default async function getRaceSessionKey({year, date, time}: Props) {
    const dateTimeISO = `${date}T${time}`;
    const url = `https://api.openf1.org/v1/sessions?year=${year}&date_start=${dateTimeISO}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch session key');
    }
    const data = await response.json();
    // Adjust this line based on the actual structure of the API response
    return data[0]?.session_key;
}