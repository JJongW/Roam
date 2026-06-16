import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex-1 space-y-4 p-5">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <div className="space-y-3 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
