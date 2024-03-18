
import UserHeader from "@/components/UserHeader";
import LeaguesList from "@/components/LeaguesList";

export default function Home() {
    // Access specific properties of the user object
    return (
        <main className="w-full h-full flex px-4 my-8 flex-col gap-4">
            <UserHeader />
            <LeaguesList />
        </main>
    );
}
