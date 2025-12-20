import { Skeleton } from "@/components/ui/skeleton";

type DashboardShellSkeletonProps = {
  showMain?: boolean;
};

const repeat = (count: number) => {
  const items: number[] = [];
  for (let i = 0; i < count; i += 1) {
    items.push(i);
  }
  return items;
};

export const DashboardShellSkeleton = ({
  showMain = true,
}: DashboardShellSkeletonProps) => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {repeat(4).map((_, idx: number) => (
          <div
            key={`stat-${idx}`}
            className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {repeat(2).map((_, idx: number) => (
          <div
            key={`top-${idx}`}
            className="rounded-2xl border border-border bg-muted/30 p-6 space-y-4"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
            <div className="space-y-3">
              {repeat(4).map((__, innerIdx: number) => (
                <Skeleton
                  key={`top-row-${idx}-${innerIdx}`}
                  className="h-4 w-full"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showMain && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {repeat(2).map((_, idx: number) => (
            <div
              key={`main-${idx}`}
              className="rounded-2xl border border-border bg-muted/30 p-6 space-y-4"
            >
              <Skeleton className="h-5 w-32" />
              <div className="space-y-3">
                {repeat(5).map((__, innerIdx: number) => (
                  <Skeleton
                    key={`main-row-${idx}-${innerIdx}`}
                    className="h-4 w-full"
                  />
                ))}
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
