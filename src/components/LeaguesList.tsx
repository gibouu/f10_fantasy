import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeagueTab from "./LeagueTab";
import getUserLeagues from "@/data/getUserLeagues";
import { Invite } from "./Invite";
import { Suspense } from "react";
import LeagueTabSkeleton from "./LeagueTabSkeleton";

export default async function LeaguesList() {
    const leagues = await getUserLeagues();

    // Determine the default tab value based on the first league's ID
    const defaultLeagueTabValue =
        leagues.length > 0 ? `league-${leagues[0].league_id}` : "";

    return (
        <Tabs defaultValue={defaultLeagueTabValue} className="h-full flex flex-col gap-4">
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
                    className="flex flex-col gap-2"
                >
                    <div className="flex justify-between">
                        <div className="text-l font-bold">
                            {league.league?.name}
                        </div>
                        <Invite inviteCode={league.league?.invite_code} />
                    </div>
                    <Suspense fallback={<LeagueTabSkeleton />}>
                        <LeagueTab leagueId={league.league_id} />
                    </Suspense>
                </TabsContent>
            ))}
        </Tabs>
    );
}
