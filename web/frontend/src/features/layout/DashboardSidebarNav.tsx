// change-log:
// - 2026-09-05: guideTourSatellite — oral_calendar 사이드 메뉴 별도 홀(구강스캔으로).
// - 2026-08-20: 관리자 섹션 포함 전 롤이 같은 사이드 렌더러. 접히면 라벨 툴팁.
// - 2026-08-20: 하위 메뉴는 점 대신 아이콘. 접힌 레일에도 하위 아이콘을 두고 클릭 가능.
// - 2026-08-19: 펼친 사이드 메인 메뉴는 아이콘 왼쪽·라벨 가운데. 배지는 우측 고정. 라벨은 줄이지 않음.
// - 2026-08-19: 접힌 그룹 메뉴는 하위 배지 합산(기공의뢰수신 미확인).
// - 2026-08-18: 그룹 메뉴(기공의뢰) 호버·클릭 글자를 foreground로 — ghost accent 흰 글자 방지.
// - 2026-08-18: 치과 기공의뢰 — 메인 행 + 들여쓴 서브(구강스캔으로 / 어벗디자인으로).
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/ui/gigongAbutAccent.ts
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isPaidRequestorSidebarLocked,
  PAID_ACCESS_DISABLED_HINT,
  type RequestorKind,
} from "@/shared/business/requestorCapabilities";
import {
  gigongAbutConnectorLineClass,
  type GigongAbutAccentKey,
} from "@/shared/ui/gigongAbutAccent";
import type { LucideIcon } from "lucide-react";

export type DashboardSidebarItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  tooltip?: string;
  accent?: GigongAbutAccentKey;
  /** 가이드투어 Spotlight 위성(data-guide-tour-satellite) — 홀에 메뉴 행 포함 */
  guideTourSatellite?: string;
  children?: DashboardSidebarItem[];
};

export type DashboardSidebarSection = {
  title?: string;
  items: DashboardSidebarItem[];
};

export const sidebarItemPath = (href: string) =>
  String(href || "").split("?")[0].replace(/\/$/, "") || "/";

const CREDITS_HREF = "/dashboard/credits";

const isItemPathActive = (href: string, pathname: string) => {
  const path = sidebarItemPath(href);
  if (path === "/dashboard") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
};

type NavButtonProps = {
  item: DashboardSidebarItem;
  pathname: string;
  isCollapsed: boolean;
  nested?: boolean;
  forceActive?: boolean;
  disablePathActive?: boolean;
  groupActive?: boolean;
  isCreditLow: boolean;
  userRole: string;
  requestorKind: RequestorKind | null;
  requestorCanUsePaid: boolean;
  onNavigate: (href: string) => void;
  getBadgeCount: (href: string) => number;
};

const SidebarNavButton = ({
  item,
  pathname,
  isCollapsed,
  nested = false,
  forceActive = false,
  disablePathActive = false,
  groupActive = false,
  isCreditLow,
  userRole,
  requestorKind,
  requestorCanUsePaid,
  onNavigate,
  getBadgeCount,
}: NavButtonProps) => {
  const itemPath = sidebarItemPath(item.href);
  const isActive =
    forceActive ||
    (!disablePathActive && isItemPathActive(item.href, pathname));
  const isCreditsLowHighlight =
    isCreditLow && itemPath === CREDITS_HREF && !isActive;
  const paidLocked =
    userRole === "requestor" &&
    isPaidRequestorSidebarLocked({
      kind: requestorKind,
      canUsePaid: requestorCanUsePaid,
      href: item.href,
    });
  const quickTooltip = paidLocked
    ? PAID_ACCESS_DISABLED_HINT
    : isCreditsLowHighlight
      ? "크레딧이 부족합니다. 충전해주세요."
      : item.tooltip || (isCollapsed ? item.label : undefined);

  const compactNested = nested && !isCollapsed;

  const button = (
    <Button
      variant="ghost"
      disabled={paidLocked}
      className={`relative z-[1] w-full justify-center transition-all ${
        compactNested
          ? "h-8 px-2.5 text-[13px] font-medium"
          : `h-10 lg:h-11 text-sm lg:text-base ${
              isCollapsed ? "px-2" : "px-3 lg:px-4"
            }`
      } ${
        paidLocked
          ? "cursor-not-allowed opacity-50"
          : isActive
            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            : nested
              ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              : groupActive
                ? "text-foreground hover:bg-muted/60 hover:text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
      onClick={() => {
        if (paidLocked) return;
        onNavigate(item.href);
      }}
      aria-current={isActive ? "page" : undefined}
      aria-label={
        isCreditsLowHighlight
          ? "크레딧 부족 — 충전 탭으로 이동"
          : isCollapsed
            ? item.label
            : undefined
      }
      {...(item.guideTourSatellite
        ? { "data-guide-tour-satellite": item.guideTourSatellite }
        : {})}
    >
      <item.icon
        className={`${compactNested ? "h-3.5 w-3.5" : "h-4 w-4"} flex-shrink-0 ${
          isCollapsed
            ? ""
            : `absolute top-1/2 -translate-y-1/2 ${
                compactNested ? "left-2.5" : "left-3"
              }`
        } ${
          compactNested && item.accent && !isActive
            ? item.accent === "기공"
              ? "text-service-gigong"
              : "text-service-abut"
            : ""
        }`}
      />
      {!isCollapsed && (
        <span className="whitespace-nowrap text-center">
          {item.label}
        </span>
      )}
      {(() => {
        const badgeCount =
          Array.isArray(item.children) && item.children.length > 0
            ? 0
            : getBadgeCount(item.href);
        if (!isCollapsed) {
          if (isCreditsLowHighlight) {
            return (
              <Badge
                variant="outline"
                className="absolute right-1.5 top-1/2 h-5 -translate-y-1/2 animate-pulse border-accent-muted bg-accent px-1.5 text-[10px] font-semibold leading-none text-accent-foreground"
              >
                충전
              </Badge>
            );
          }
          return badgeCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute right-1.5 top-1/2 flex h-5 min-w-[1.25rem] -translate-y-1/2 items-center justify-center px-1 text-[10px] font-semibold leading-none"
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </Badge>
          ) : null;
        }
        if (isCreditsLowHighlight) {
          return (
            <span
              aria-hidden
              className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
            />
          );
        }
        return badgeCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-white"
            aria-label={`미확인 ${badgeCount}건`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null;
      })()}
    </Button>
  );

  const buttonWithAccent =
    !nested && item.accent ? (
      <div className="relative">
        <div aria-hidden className={gigongAbutConnectorLineClass(item.accent)} />
        {button}
      </div>
    ) : (
      button
    );

  if (!quickTooltip) return buttonWithAccent;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`block w-full ${paidLocked ? "cursor-not-allowed" : ""}`}
          >
            <span
              className={paidLocked ? "pointer-events-none block" : "block"}
            >
              {buttonWithAccent}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-center">
          <p>{quickTooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

type ListProps = {
  items?: DashboardSidebarItem[];
  sections?: DashboardSidebarSection[];
  isCollapsed: boolean;
  pathname: string;
  isCreditLow: boolean;
  userRole: string;
  requestorKind: RequestorKind | null;
  requestorCanUsePaid: boolean;
  onNavigate: (href: string) => void;
  getBadgeCount: (href: string) => number;
};

export function DashboardSidebarNav({
  items,
  sections,
  isCollapsed,
  pathname,
  isCreditLow,
  userRole,
  requestorKind,
  requestorCanUsePaid,
  onNavigate,
  getBadgeCount,
}: ListProps) {
  const buttonProps = {
    pathname,
    isCollapsed,
    isCreditLow,
    userRole,
    requestorKind,
    requestorCanUsePaid,
    onNavigate,
    getBadgeCount,
  };

  const resolvedSections: DashboardSidebarSection[] =
    sections && sections.length > 0 ? sections : [{ items: items ?? [] }];
  const sectioned = resolvedSections.some((section) => Boolean(section.title));

  const renderItems = (sectionItems: DashboardSidebarItem[]) => (
    <ul className="space-y-1 lg:space-y-2">
      {sectionItems.map((item) => {
        const children = Array.isArray(item.children) ? item.children : [];
        const childActive = children.some((child) =>
          isItemPathActive(child.href, pathname),
        );

        if (children.length === 0) {
          return (
            <li key={`${item.label}:${item.href}`}>
              <SidebarNavButton item={item} {...buttonProps} />
            </li>
          );
        }

        return (
          <li key={`${item.label}:${item.href}`}>
            {!isCollapsed ? (
              <SidebarNavButton
                item={item}
                {...buttonProps}
                disablePathActive
                groupActive={childActive}
              />
            ) : null}
            <ul
              className={
                isCollapsed
                  ? "space-y-1 lg:space-y-2"
                  : "relative mb-1 mt-1 ml-[1.15rem] space-y-0.5 border-l border-border/80 pl-2.5"
              }
              aria-label={`${item.label} 하위 메뉴`}
            >
              {children.map((child) => (
                <li key={`${child.label}:${child.href}`}>
                  <SidebarNavButton
                    item={child}
                    {...buttonProps}
                    nested
                  />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  if (!sectioned) {
    return renderItems(resolvedSections[0]?.items ?? []);
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {resolvedSections.map((section) => (
        <div
          key={section.title ?? section.items[0]?.href}
          className="space-y-2"
        >
          {!isCollapsed && section.title ? (
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
              {section.title}
            </div>
          ) : null}
          {renderItems(section.items)}
        </div>
      ))}
    </div>
  );
}
