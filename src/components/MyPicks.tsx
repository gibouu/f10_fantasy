
import { Driver } from "../../types/f1";
import PicksForm from "./PicksForm";
import getUserRacePicks from "@/actions/getUserRacePicks";


type Props = {
    drivers: Driver[];
    leagueId: string;
    season: string;
    round: string;
};

export default async function MyPicks({
    drivers,
    leagueId,
    season,
    round,
}: Props) {
    const picks = await getUserRacePicks(leagueId, season, round);

    return (
        <div className="flex flex-col gap-4">
            <div>My Picks</div>
            <PicksForm
                drivers={drivers}
                leagueId={leagueId}
                season={season}
                round={round}
                pick={picks[0]?.tenth_pick}
                keyValue="tenth_pick"
                label="10th Place"
            />
            <PicksForm
                drivers={drivers}
                leagueId={leagueId}
                season={season}
                round={round}
                pick={picks[0]?.third_pick}
                keyValue="third_pick"
                label="3rd Place"
            />
            <PicksForm
                drivers={drivers}
                leagueId={leagueId}
                season={season}
                round={round}
                pick={picks[0]?.dnf_pick}
                keyValue="dnf_pick"
                label="DNF"
            />
        </div>
    );
}
