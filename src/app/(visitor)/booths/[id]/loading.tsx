import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex-1 space-y-5 p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
