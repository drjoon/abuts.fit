import { Skeleton } from "@/components/ui/skeleton";

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

export const NewRequestPageSkeleton = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-52 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {repeat(6).map((key) => (
              <Skeleton key={key} className="h-12 w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Skeleton className="h-5 w-40" />
            {repeat(4).map((key) => (
              <Skeleton key={key} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <Skeleton className="h-5 w-28" />
            {repeat(3).map((key) => (
              <Skeleton key={key} className="h-10 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
};
