import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import PicksTab from "./PicksTab";
import QualifyingTab from "./QualifyingTab";
import RaceTab from "./RaceTab";
import { Driver } from "../../types/f1";
import getRaceResults from "@/actions/getRaceResults";

type Props = {
    leagueId: string,
    drivers: Driver[],
    season: string,
    round: string
}

export default async function RaceContentWrapper({leagueId, drivers, season, round}: Props) {

    const results = await getRaceResults({round})

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
                    drivers={drivers}
                    season={season}
                    round={round}
                    results={results}
                />
            </TabsContent>
            <TabsContent value="qualifying results">
                <QualifyingTab />
            </TabsContent>
            <TabsContent value="race results">
                <RaceTab results={results} />
            </TabsContent>
        </Tabs>
    );
}
