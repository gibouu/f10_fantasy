import getLeagueRacePicks from "@/data/getLeagueRacePicks";
import LeaguePicks from "./LeaguePicks";
import MyPicks from "./MyPicks";
import getInitialRaceResults from "@/data/getInitialRaceResults";

type Props = {
    leagueId: string;
    meetingKey: string | null;
    raceSessionKey: string | null;
    round: string
};

export default async function PicksTab({
    leagueId,
    meetingKey,
    raceSessionKey,
    round
}: Props) {

    const picks = await getLeagueRacePicks(leagueId, round, meetingKey);

    const initialResults = await getInitialRaceResults({round, raceSessionKey});

    return (
        <div className="flex flex-col gap-4">
            <MyPicks
                leagueId={leagueId}
                round={round}
                meetingKey={meetingKey}
            />
            <div className="flex flex-col gap-4">
                <div>League Picks</div>
                <LeaguePicks
                picks={picks}
                initialResults={initialResults}
                raceSessionKey={raceSessionKey}
                />
            </div>
        </div>
    );
}
