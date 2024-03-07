import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


import { Driver, RaceEvent } from "../../types/f1";
import RaceContentWrapper from "./RaceContentWrapper";

type Props = {
    leagueId: string,
    races: RaceEvent[],
    drivers: Driver[]
};

export default async function FantasyTab({ leagueId, races, drivers }: Props) {

    // Determine the default tab value based on the first league's ID
    const defaultTabValue = races.length > 0 ? `race-${races[0].round}` : "";

    return (
        <Tabs defaultValue={defaultTabValue}>
            <TabsList className="h-full">
                {races.map((race) => (
                    <TabsTrigger key={race.round} value={`race-${race.round}`}>
                        <div className="flex flex-col">
                            <div>{race.raceName}</div>
                            <div>{race.date}</div>
                            <div>{race.time}</div>
                        </div>
                    </TabsTrigger>
                ))}
            </TabsList>
            {races.map((race) => (
                <TabsContent key={race.round} value={`race-${race.round}`}>
                    <RaceContentWrapper leagueId={leagueId} drivers={drivers} season={race.season} round={race.round}  />
                </TabsContent>
            ))}
        </Tabs>
    );
}
