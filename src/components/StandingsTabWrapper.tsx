import getLeaguePicks from "@/data/getLeaguePicks";
import StandingsTab from "./StandingsTab";
import getRacesResultsErgast from "@/data/getRacesResultsErgast";

type Props = {
    leagueId: string;
};

export default async function StandingsTabWrapper({ leagueId }: Props) {
    
    const { users, picks } = await getLeaguePicks({ leagueId });
    const initialRacesResults = await getRacesResultsErgast();

    return (
        <StandingsTab
            leagueId={leagueId}
            users={users}
            initialResults={initialRacesResults}
            picks={picks}
        />
    );
}
