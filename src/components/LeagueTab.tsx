import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FantasyTab from "./FantasyTab";
import { Suspense } from "react";
import StandingsTabWrapper from "./StandingsTabWrapper";
import StandingsTabSkeleton from "./StandingsTabSkeleton";
type Props = {
    leagueId: string;
};

export default async function LeagueTab({ leagueId }: Props) {

    return (
        <Tabs defaultValue="fantasy">
            <TabsList className="flex justify-between gap-2">
                <TabsTrigger value="fantasy">Fantasy</TabsTrigger>
                <TabsTrigger value="standings">Standings</TabsTrigger>
            </TabsList>
            <TabsContent value="fantasy">
                <FantasyTab leagueId={leagueId} />
            </TabsContent>
            <TabsContent value="standings">
                <Suspense fallback={<StandingsTabSkeleton />}>
                    <StandingsTabWrapper leagueId={leagueId} />
                </Suspense>
            </TabsContent>
        </Tabs>
    );
}
