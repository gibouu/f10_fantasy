type Props = {
    year: string;
    raceName: string;
}

export default async function getMeetingKey({year, raceName}: Props) {

    const encodedRaceName = encodeURIComponent(raceName);

    const url = `https://api.openf1.org/v1/meetings?year=${year}&meeting_name=${encodedRaceName}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Failed to fetch session key');
    }

    const data = await response.json();

    if(data.length === 0){
        return null
    }

    const meeting_key: string = data[0].meeting_key

    return meeting_key;
}