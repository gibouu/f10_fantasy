import { getServerSession } from "next-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FantasyTab from "@/components/FantasyTab";
import StandingsTab from "@/components/StandingsTab";
import getSupabaseClient from "@/db/supabaseClient";
import getUser from "@/actions/getUser";
import { options } from "./api/auth/[...nextauth]/options";


export default async function Home() {
  const session = await getServerSession(options);

  const { supabase } = await getSupabaseClient();

  const sessionUser = await getUser();

  const { data: user, error } = await supabase
      .from('user_league')
      .select(`
        league_id,
        league:league_id (*)  // Perform a join to fetch league details
      `)
      .eq('user_id', sessionUser.id); // Filter by user ID

    if (error) {
      console.error("Error fetching leagues:", error.message);
    } else {
      
    }

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


