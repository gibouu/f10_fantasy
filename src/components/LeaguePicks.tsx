import getLeagueRacePicks from "@/actions/getLeagueRacePicks";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Result } from "../../types/f1";
import { calculatePointsForPick } from "@/lib/calculatePoints";

type Props = {
    leagueId: string;
    season: string;
    round: string;
    results: Result[] | null;
};

export const revalidate = 3600

export default async function LeaguePicks({ leagueId, season, round, results }: Props) {

    const picks = await getLeagueRacePicks(leagueId, season, round);

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>10th Place</TableHead>
                    <TableHead>3rd Place</TableHead>
                    <TableHead>DNF</TableHead>
                    <TableHead>Points</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {picks?.map((pick) => (
                    <TableRow
                        key={`${pick.user_id}-${pick.league_id}-${pick.season}-${pick.round}`}
                    >
                        <TableCell>{pick.users?.name}</TableCell>
                        <TableCell>{pick.tenth_pick_name}</TableCell>
                        <TableCell>{pick.third_pick_name}</TableCell>
                        <TableCell>{pick.dnf_pick_name}</TableCell>
                        <TableCell>{calculatePointsForPick({pick, results})}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
