// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// change-log:
// - 2026-08-17: fillHeight — 작업영역 높이를 채우고 본문만 남은 공간을 쓰게 함(이중 스크롤 방지).
import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  topSection?: ReactNode;
  stats: ReactNode;
  mainLeft?: ReactNode;
  mainRight?: ReactNode;
  headerRight?: ReactNode;
  statsGridClassName?: string;
  /**
   * true면 대시보드 outlet 높이를 채운다.
   * 요약 카드는 고정, 본문(mainLeft/mainRight)이 남은 높이를 쓴다.
   */
  fillHeight?: boolean;
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
  fillHeight = false,
}: DashboardShellProps) => {
  const hasBothMain = Boolean(mainLeft && mainRight);
  const mainGridClassName = fillHeight
    ? hasBothMain
      ? "grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2"
      : "flex min-h-0 flex-1 flex-col overflow-hidden"
    : hasBothMain
      ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
      : "grid grid-cols-1 gap-3";

  const effectiveStatsGridClassName =
    statsGridClassName ||
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5";

  return (
    <div
      className={
        fillHeight
          ? "box-border flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3"
          : "space-y-3 p-3"
      }
    >
      {/* <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div> */}
      <div className={fillHeight ? "shrink-0 space-y-3" : "space-y-3"}>
        {headerRight && <div className="flex justify-start">{headerRight}</div>}
        <div className={effectiveStatsGridClassName}>{stats}</div>
      </div>

      {topSection && (
        <div className={fillHeight ? "shrink-0" : undefined}>{topSection}</div>
      )}

      {(mainLeft || mainRight) && (
        <div className={mainGridClassName}>
          {mainLeft && (
            <div
              className={cn(
                hasBothMain ? "" : "w-full",
                fillHeight && "flex h-full min-h-0 flex-col overflow-hidden",
              )}
            >
              {mainLeft}
            </div>
          )}
          {mainRight && (
            <div
              className={cn(
                hasBothMain ? "" : "w-full",
                fillHeight && "flex h-full min-h-0 flex-col overflow-hidden",
              )}
            >
              {mainRight}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
