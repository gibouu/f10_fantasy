import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import RaceContentWrapper from "./RaceContentWrapper";
import getRacesSchedule from "@/data/getRacesSchedule";

type Props = {
    leagueId: string
};

export default async function FantasyTab({ leagueId }: Props) {

    const races = await getRacesSchedule();

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
                    <RaceContentWrapper leagueId={leagueId} qualifyingSessionKey={race.openF1QualifyingKey} raceSessionKey={race.openF1RaceKey} meetingKey={race.openF1MeetingKey} round={race.round} />
                </TabsContent>
            ))}
        </Tabs>
    );
}
