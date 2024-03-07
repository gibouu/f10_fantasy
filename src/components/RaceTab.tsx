import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Result } from "../../types/f1";

type Props = {
    results: Result[] | null;
};

export default async function RaceTab({ results }: Props) {

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Position</TableHead>
                    <TableHead>Driver</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {results?.map(result => (
                    <TableRow key={result.number}>
                        <TableCell>{result.position}</TableCell>
                        <TableCell>{`${result.Driver.givenName} ${result.Driver.familyName}`}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
