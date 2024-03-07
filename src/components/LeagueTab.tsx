import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FantasyTab from "./FantasyTab";
import StandingsTab from "./StandingsTab";
import { Driver, RaceEvent, RacesResults } from "../../types/f1";
import getLeagueUsers from "@/actions/getLeagueUsers";

type Props = {
    leagueId: string,
    races: RaceEvent[],
    drivers: Driver[],
    racesResults: RacesResults[] | null
}

export default async function LeagueTab({leagueId, races, drivers, racesResults}: Props) {

    const users = await getLeagueUsers({ leagueId });
    
    return (
            <Tabs defaultValue="fantasy">
                <TabsList className="flex justify-between gap-2">
                    <TabsTrigger value="fantasy">Fantasy</TabsTrigger>
                    <TabsTrigger value="standings">Standings</TabsTrigger>
                </TabsList>
                <TabsContent value="fantasy">
                    <FantasyTab leagueId={leagueId} races={races} drivers={drivers}/>
                </TabsContent>
                <TabsContent value="standings">
                    <StandingsTab leagueId={leagueId} racesResults={racesResults} users={users} />
                </TabsContent>
            </Tabs>
    );
}
