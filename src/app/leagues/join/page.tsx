import joinLeague from "@/actions/joinLeague";
import { options } from "@/app/api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";

export default async function JoinLeague({ searchParams }: any) {
    const session = await getServerSession(options);

    if (session) {
        const leagueCode = searchParams.invite;
        await joinLeague(leagueCode);
    }

    return (
        <div>Joining league please wait you will be redirected hopefully</div>
    );
}
