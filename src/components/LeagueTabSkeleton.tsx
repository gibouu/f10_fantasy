import { Skeleton } from "./ui/skeleton";

export default function LeagueTabSkeleton() {
    return (
        <div className="flex flex-col gap-2 h-full">
            <Skeleton className="w-full h-10 flex justify-between items-center">
                <Skeleton>Fantasy</Skeleton>
                <Skeleton>Standings</Skeleton>
            </Skeleton>
            <div className="flex flex-col gap-2">
                <Skeleton className="w-full h-20 flex items-center justify-center">
                    Loading races...
                </Skeleton>
                <Skeleton className="w-full grow">Loading picks...</Skeleton>
            </div>
        </div>
    );
}
