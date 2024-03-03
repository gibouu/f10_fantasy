import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    // You can add any UI inside Loading, including a Skeleton.
    return <div>
      <Skeleton className="w-[100px] h-[20px] rounded-full" />
      </div>
  }