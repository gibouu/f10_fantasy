
import getDrivers from "@/data/getDrivers";
import PicksForm from "./PicksForm";
import getUserRacePicks from "@/data/getUserRacePicks";

const fs = require('fs');





type Props = {
    leagueId: string;
    round: string;
    meetingKey: string | null;
};

export default async function MyPicks({
    leagueId,
    round,
    meetingKey
}: Props) {

    const picks = await getUserRacePicks(leagueId, round);

    const drivers = await getDrivers(meetingKey);

    return (
        <div className="flex flex-col gap-4">
            <div>My Picks</div>
            <PicksForm
                drivers={drivers}
                leagueId={leagueId}
                round={round}
                meetingKey={meetingKey}
                pick={picks[0]?.tenth_pick}
                keyValue="tenth_pick"
                label="10th Place"
            />
            <PicksForm
                drivers={drivers}
                leagueId={leagueId}
                round={round}
                meetingKey={meetingKey}
                pick={picks[0]?.third_pick}
                keyValue="third_pick"
                label="3rd Place"
            />
            <PicksForm
                drivers={drivers}
                leagueId={leagueId}
                round={round}
                meetingKey={meetingKey}
                pick={picks[0]?.dnf_pick}
                keyValue="dnf_pick"
                label="DNF"
            />
        </div>
    );
}
