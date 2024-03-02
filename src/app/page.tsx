import { getServerSession } from "next-auth";
import { options } from "./api/auth/[...nextauth]/options";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FantasyTab from "@/components/FantasyTab";
import StandingsTab from "@/components/StandingsTab";

interface User {
  name: string;
  email: string;
}

interface Session {
  user?: User;
}

export default async function Home() {
  const session: Session | null = await getServerSession(options);

  if (!session || !session.user) {
    return null;
  }

  // Access specific properties of the user object
  return (
    <main className="flex flex-col">
      <div>F10 Fantasy</div>
      <div>Welcome back! {session.user.name}!</div>
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
