import type { ReactNode } from "react";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  topSection?: ReactNode;
  stats: ReactNode;
  mainLeft?: ReactNode;
  mainRight?: ReactNode;
  headerRight?: ReactNode;
  statsGridClassName?: string;
};

export const DashboardShell = ({
  title,
  subtitle,
  topSection,
  stats,
  mainLeft,
  mainRight,
  headerRight,
  statsGridClassName,
}: DashboardShellProps) => {
  const hasBothMain = Boolean(mainLeft && mainRight);
  const mainGridClassName = hasBothMain
    ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
    : "grid grid-cols-1 gap-3";

  const effectiveStatsGridClassName =
    statsGridClassName ||
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5";

  return (
    <div className="p-3 space-y-3">
      {/* <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div> */}
      <div className="space-y-3">
        {headerRight && <div className="flex justify-start">{headerRight}</div>}
        <div className={effectiveStatsGridClassName}>{stats}</div>
      </div>

      {topSection && <div>{topSection}</div>}

      {(mainLeft || mainRight) && (
        <div className={mainGridClassName}>
          {mainLeft && (
            <div className={hasBothMain ? "" : "w-full"}>{mainLeft}</div>
          )}
          {mainRight && (
            <div className={hasBothMain ? "" : "w-full"}>{mainRight}</div>
          )}
        </div>
      )}
    </div>
  );
};
