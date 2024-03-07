import { getServerSession } from "next-auth";
import { options } from "@/app/api/auth/[...nextauth]/options";

export default async function UserHeader() {
    const session = await getServerSession(options);

    return <div>Welcome back {session?.user.name}!</div>;
}
