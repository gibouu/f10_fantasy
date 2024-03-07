import { RacesResults } from "../../types/f1";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { calculatePointsForStandings } from "@/lib/calculatePoints";
import { Tables } from "../../types/supabase";

interface Users {
    users: Tables<'users'> | null
}

type Props = {
    leagueId: string;
    racesResults: RacesResults[] | null;
    users: Users[]
};

export default function StandingsTab({ leagueId, racesResults, users }: Props) {

    return (
        <div>
            <div>Standings</div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>Points</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users?.map((user) => (
                        <TableRow key={user.users?.id}>
                            <TableCell>{user.users?.name}</TableCell>
                            <TableCell>
                                {calculatePointsForStandings({
                                    leagueId,
                                    userId: user.users?.id,
                                    racesResults,
                                })}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
