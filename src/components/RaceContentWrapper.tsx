import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import PicksTab from "./PicksTab";
import QualifyingTab from "./QualifyingTab";
import RaceTab from "./RaceTab";
import getRaceResults from "@/data/getRaceResults";
import getQualifyingResults from "@/data/getQualifyingResults";

type Props = {
    leagueId: string;
    qualifyingSessionKey: string;
    raceSessionKey: string;
    meetingKey: string | null;
    round: string;
};

export default async function RaceContentWrapper({
    leagueId,
    qualifyingSessionKey,
    raceSessionKey,
    meetingKey,
    round
}: Props) {
    const { qualiResults, qualiStatus } = await getQualifyingResults({
        initial: true,
        session_key: qualifyingSessionKey,
    });
    const { raceResults, raceStatus } = await getRaceResults({
        initial: true,
        session_key: raceSessionKey,
    });

    return (
        <Tabs defaultValue="picks">
            <TabsList className="flex justify-between gap-2">
                <TabsTrigger value="picks">Picks</TabsTrigger>
                <TabsTrigger value="qualifying results">
                    Qualifying Results
                </TabsTrigger>
                <TabsTrigger value="race results">Race Results</TabsTrigger>
            </TabsList>
            <TabsContent value="picks">
                <PicksTab
                    leagueId={leagueId}
                    round={round}
                    meetingKey={meetingKey}
                    raceSessionKey={raceSessionKey}
                />
            </TabsContent>
            <TabsContent value="qualifying results">
                <QualifyingTab
                    initialResults={qualiResults}
                    initialStatus={qualiStatus}
                    sessionKey={qualifyingSessionKey}
                />
            </TabsContent>
            <TabsContent value="race results">
                <RaceTab
                    initialResults={raceResults}
                    initialStatus={raceStatus}
                    sessionKey={raceSessionKey}
                />
            </TabsContent>
        </Tabs>
    );
}
