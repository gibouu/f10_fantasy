import { Driver, Result } from "../../types/f1";
import LeaguePicks from "./LeaguePicks";
import MyPicks from "./MyPicks";

type Props = {
    leagueId: string;
    drivers: Driver[];
    season: string;
    round: string;
    results: Result[] | null;
};

export default async function PicksTab({
    leagueId,
    drivers,
    season,
    round,
    results
}: Props) {
    return (
        <div className="flex flex-col gap-4">
            <MyPicks
                drivers={drivers}
                leagueId={leagueId}
                season={season}
                round={round}
            />
            <div className="flex flex-col gap-4">
                <div>League Picks</div>
                <LeaguePicks
                    leagueId={leagueId}
                    season={season}
                    round={round}
                    results={results}
                />
            </div>
        </div>
    );
}
