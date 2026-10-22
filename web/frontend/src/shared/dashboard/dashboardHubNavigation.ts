// related files:
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/adminUi.tsx
// change-log:
// - 2026-10-22: 허브 사이드바 이동·미읽음 탭 기본 선택 SSOT.
import type { CommBadgeCounts } from "@/shared/hooks/useAdminCommBadges";

export type DashboardHubExtraCounts = {
  /** 재무「설정」탭 — 기본 기공수가 검토 대기 */
  abutsFeePending?: number;
};

type HubTabSpec = {
  tab: string;
  badge: (counts: CommBadgeCounts, extra: DashboardHubExtraCounts) => number;
};

const DASHBOARD_HUB_TABS: Record<
  string,
  { defaultTab: string; tabs: HubTabSpec[] }
> = {
  "/dashboard/channels": {
    defaultTab: "chat",
    tabs: [
      { tab: "chat", badge: (c) => c.chat ?? 0 },
      { tab: "sms", badge: (c) => c.sms ?? 0 },
      { tab: "mail", badge: (c) => c.mail ?? 0 },
    ],
  },
  "/dashboard/support": {
    defaultTab: "remote",
    tabs: [
      { tab: "remote", badge: (c) => c.remoteSupport ?? 0 },
      { tab: "inquiries", badge: (c) => c.inquiry ?? 0 },
    ],
  },
  "/dashboard/members": {
    defaultTab: "businesses",
    tabs: [{ tab: "users", badge: (c) => c.member ?? 0 }],
  },
  "/dashboard/finance": {
    defaultTab: "credits",
    tabs: [
      { tab: "credits", badge: (c) => c.finance ?? 0 },
      {
        tab: "settings",
        badge: (_c, extra) => Math.max(0, Number(extra.abutsFeePending ?? 0)),
      },
      { tab: "tax", badge: (c) => c.tax ?? 0 },
    ],
  },
};

function normalizeHubPath(href: string) {
  return String(href || "").split("?")[0].replace(/\/$/, "") || "/";
}

/** 사이드바 클릭 시 미읽음(배지)이 있는 탭으로 ?tab= 붙임 */
export function resolveDashboardHubHref(
  href: string,
  counts: CommBadgeCounts,
  extra: DashboardHubExtraCounts = {},
): string {
  const [pathPart, queryPart] = String(href || "").split("?");
  const path = normalizeHubPath(pathPart);
  const hub = DASHBOARD_HUB_TABS[path];
  if (!hub) return href;

  let bestTab = hub.defaultTab;
  let bestCount = 0;
  for (const spec of hub.tabs) {
    const n = Math.max(0, Number(spec.badge(counts, extra) || 0));
    if (n > bestCount) {
      bestCount = n;
      bestTab = spec.tab;
    }
  }
  if (bestCount <= 0) return pathPart || href;

  const params = new URLSearchParams(queryPart || "");
  if (bestTab === hub.defaultTab) params.delete("tab");
  else params.set("tab", bestTab);
  const qs = params.toString();
  return qs ? `${pathPart}?${qs}` : pathPart;
}
