// change-log:
// - 2026-08-22: 작업 영역 가로폭을 사업영역과 동일하게 max-w-4xl로 축소.
// - 2026-08-21: 커스텀어벗 탭 — 치과 공급 삭제, 기공소 공급→커스텀어벗 가격(생산만).
// - 2026-08-19: 커스텀어벗 탭 고시 라벨(생산·디자인+생산). 디자인비+지그 설정 카드 제거.
// - 2026-08-17: 수익분배·사업영역은 별도「사업영역」메뉴(`/dashboard/partners`).
// - 2026-08-18: 「매출 및 분배」→「커스텀어벗」탭 제목 복원.
// - 2026-08-18: 「커스텀어벗」탭 →「매출 및 분배」.
// - 2026-08-16: 「커스텀어벗 요금 · 크레딧」→「크레딧」+「커스텀어벗」탭 분리.
// - 2026-08-16: 「기공소 매칭」→「인증 기공소」탭 라벨.
// - 2026-08-14: 기공소 신규 기공비 → 어벗츠 수가 검토 배지·탭 하이라이트.
// - 2026-08-14: 기공소 매칭 탭을 단일 카드(수수료+인증 목록)로 합침.
// - 2026-08-14: 기공소 수가 탭 추가(목록·클릭 모달).
// - 2026-08-14: 환봉방식 커스텀어벗은 커스텀어벗 요금·크레딧(의뢰·배송)으로 이전.
// - 2026-08-14: 환봉방식 커스텀어벗(치과 제조사 추가요청) 탭 추가.
// - 2026-08-13: 기공소 매칭 수수료율은 admin platform-fees API로 개발운영사 앵커에 저장.
// - 2026-08-13: 개발운영사 파트너 페이지를 관리자「플랫폼 설정」으로 이전.
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/features/settings/tabs/AdminLabFeeSchedulesTab.tsx
// - web/frontend/src/features/settings/tabs/AdminAbutsLabFeeScheduleTab.tsx
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AdminCreditSettingsTab } from "@/features/settings/tabs/AdminCreditSettingsTab";
import { AdminLabFeeSchedulesTab } from "@/features/settings/tabs/AdminLabFeeSchedulesTab";
import { AdminAbutsLabFeeScheduleTab } from "@/features/settings/tabs/AdminAbutsLabFeeScheduleTab";
import { PracticeTransferAutoMatchTab } from "@/pages/devops/components/PracticeTransferAutoMatchTab";
import {
  BadgeJapaneseYen,
  Banknote,
  CreditCard,
  FlaskConical,
  Package,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";

type TabKey = "credits" | "customAbut" | "autoMatch" | "abutsFees" | "labFees";

const LEGACY_TAB_REDIRECT: Record<string, TabKey> = {
  design: "autoMatch",
  deadline: "autoMatch",
  payment: "autoMatch",
  roundBar: "customAbut",
};

export const AdminPlatformSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuthStore();
  const [abutsPendingCount, setAbutsPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<{
        data?: { pendingCount?: number; items?: Array<{ pendingReview?: boolean }> };
      }>({
        path: "/api/admin/settings/abuts-lab-fee-schedule",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const payload = res.data?.data;
      if (typeof payload?.pendingCount === "number") {
        setAbutsPendingCount(Math.max(0, payload.pendingCount));
        return;
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setAbutsPendingCount(
        items.filter((item) => item.pendingReview === true).length,
      );
    } catch {
      // silent
    }
  }, [token]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["abuts-lab-fee:pending-items"],
    deferWhenEditing: false,
    onMatch: (evt) => {
      const count = Number(
        (evt?.data as { pendingCount?: number } | undefined)?.pendingCount,
      );
      if (Number.isFinite(count) && count >= 0) {
        setAbutsPendingCount(count);
        return;
      }
      void refreshPendingCount();
    },
  });

  const handlePendingCountChange = useCallback((count: number) => {
    const next = Math.max(0, Number(count) || 0);
    setAbutsPendingCount(next);
    try {
      window.dispatchEvent(
        new CustomEvent("abuts:abuts-lab-fee-pending", {
          detail: { pendingCount: next },
        }),
      );
    } catch {
      // ignore
    }
  }, []);

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "credits",
        label: "크레딧",
        icon: CreditCard,
        content: <AdminCreditSettingsTab variant="credits" />,
      },
      {
        key: "customAbut",
        label: "커스텀어벗",
        icon: Package,
        content: <AdminCreditSettingsTab variant="customAbut" />,
      },
      {
        key: "autoMatch",
        label: "인증 기공소",
        icon: FlaskConical,
        content: <PracticeTransferAutoMatchTab />,
      },
      {
        key: "abutsFees",
        label: "기본 기공수가",
        icon: BadgeJapaneseYen,
        badgeCount: abutsPendingCount,
        content: (
          <AdminAbutsLabFeeScheduleTab
            onPendingCountChange={handlePendingCountChange}
          />
        ),
      },
      {
        key: "labFees",
        label: "기공소 수가",
        icon: Banknote,
        content: <AdminLabFeeSchedulesTab />,
      },
    ],
    [abutsPendingCount, handlePendingCountChange],
  );

  const rawTab = searchParams.get("tab");
  const mapped =
    rawTab && LEGACY_TAB_REDIRECT[rawTab]
      ? LEGACY_TAB_REDIRECT[rawTab]
      : (rawTab as TabKey | null);
  const tabFromUrl = mapped || (tabs[0]?.key as TabKey);
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs[0]?.key as TabKey);

  return (
    <SettingsScaffold
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(next) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("tab", next);
        setSearchParams(nextParams, { replace: true });
      }}
      highlightTabKey={abutsPendingCount > 0 ? "abutsFees" : undefined}
    />
  );
};
