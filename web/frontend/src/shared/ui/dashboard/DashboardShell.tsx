import type { ReactNode } from "react";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  topSection?: ReactNode;
  stats: ReactNode;
  mainLeft?: ReactNode;
  mainRight?: ReactNode;
  headerRight?: ReactNode;
};

export const DashboardShell = ({
  title,
  subtitle,
  topSection,
  stats,
  mainLeft,
  mainRight,
  headerRight,
}: DashboardShellProps) => {
  return (
    <div className="p-6 space-y-6">
      {/* <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div> */}
      <div className="space-y-3">
        {headerRight && <div className="flex justify-start">{headerRight}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {stats}
        </div>
      </div>

      {topSection && <div>{topSection}</div>}

      {(mainLeft || mainRight) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {mainLeft && <div>{mainLeft}</div>}
          {mainRight && <div>{mainRight}</div>}
        </div>
      )}
    </div>
  );
};
