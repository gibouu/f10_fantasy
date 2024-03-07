import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeagueTab from "./LeagueTab";
import getUserLeagues from "@/actions/getUserLeagues";
import { Driver, RaceEvent } from "../../types/f1";
import getRacesResults from "@/actions/getRacesResults";
import { Invite } from "./Invite";
type Props = {
    races: RaceEvent[];
    drivers: Driver[];
};

export default async function LeaguesList({ races, drivers }: Props) {
    const leagues = await getUserLeagues();
    const racesResults = await getRacesResults();

    // Determine the default tab value based on the first league's ID
    const defaultLeagueTabValue =
        leagues.length > 0 ? `league-${leagues[0].league_id}` : "";

    return (
        <Tabs defaultValue={defaultLeagueTabValue}>
            <TabsList>
                {leagues.map((league) => (
                    <TabsTrigger
                        key={league.league_id}
                        value={`league-${league.league_id}`}
                    >
                        {league.league?.name}
                    </TabsTrigger>
                ))}
            </TabsList>
            {leagues.map((league) => (
                <TabsContent
                    key={league.league_id}
                    value={`league-${league.league_id}`}
                >
                    <div className="text-l font-bold">
                        {league.league?.name}
                    </div>
                    <Invite inviteCode={league.league?.invite_code} />
                    <LeagueTab
                        leagueId={league.league_id}
                        races={races}
                        drivers={drivers}
                        racesResults={racesResults}
                    />
                </TabsContent>
            ))}
        </Tabs>
    );
}
