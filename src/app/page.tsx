import { getServerSession } from "next-auth";
import { options } from "./api/auth/[...nextauth]/options";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FantasyTab from "@/components/FantasyTab";
import StandingsTab from "@/components/StandingsTab";


export default async function Home() {
  const session = await getServerSession(options);

  // Access specific properties of the user object
  return (
    <main className="flex flex-col">
      <div>Welcome back!! {session?.user.name}!</div>
      <Tabs defaultValue="fantasy" className="w-[400px]">
        <TabsList>
          <TabsTrigger value="fantasy">Fantasy</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
        </TabsList>
        <TabsContent value="fantasy">
          <FantasyTab />
        </TabsContent>
        <TabsContent value="standings"><StandingsTab /></TabsContent>
      </Tabs>
    </main>
  );
}
