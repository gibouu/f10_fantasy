
import getRacesSchedule from "@/actions/getRacesSchedule";
import UserHeader from "@/components/UserHeader";
import getDrivers from "@/actions/getDrivers";
import LeaguesList from "@/components/LeaguesList";

export default async function Home() {

    const races = await getRacesSchedule();
    const drivers = await getDrivers();

    // Access specific properties of the user object
    return (
        <main className="w-full h-full flex px-4 my-8 flex-col gap-4">
            <UserHeader />
            <div className="text-xl font-bold">Your Leagues 2024</div>
            <LeaguesList races={races} drivers={drivers} />
        </main>
    );
}
