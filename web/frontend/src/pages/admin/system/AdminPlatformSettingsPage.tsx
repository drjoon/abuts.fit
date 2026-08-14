// change-log:
// - 2026-08-14: 기공소 매칭 탭을 단일 카드(수수료+인증 목록)로 합침.
// - 2026-08-14: 기공소 수가 탭 추가(목록·호버 툴팁).
// - 2026-08-14: 환봉방식 커스텀어벗은 커스텀어벗 요금·크레딧(의뢰·배송)으로 이전.
// - 2026-08-14: 환봉방식 커스텀어벗(치과 제조사 추가요청) 탭 추가.
// - 2026-08-13: 기공소 매칭 수수료율은 admin platform-fees API로 개발운영사 앵커에 저장.
// - 2026-08-13: 개발운영사 파트너 페이지를 관리자「플랫폼 설정」으로 이전.
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/features/settings/tabs/AdminLabFeeSchedulesTab.tsx
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { AdminCreditSettingsTab } from "@/features/settings/tabs/AdminCreditSettingsTab";
import { AdminLabFeeSchedulesTab } from "@/features/settings/tabs/AdminLabFeeSchedulesTab";
import { PracticeTransferAutoMatchTab } from "@/pages/devops/components/PracticeTransferAutoMatchTab";
import { Banknote, CreditCard, FlaskConical } from "lucide-react";

type TabKey = "credits" | "autoMatch" | "labFees";

const LEGACY_TAB_REDIRECT: Record<string, TabKey> = {
  design: "autoMatch",
  deadline: "autoMatch",
  payment: "autoMatch",
  roundBar: "credits",
};

export const AdminPlatformSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: SettingsTabDef[] = useMemo(
    () => [
      {
        key: "credits",
        label: "커스텀어벗 요금 · 크레딧",
        icon: CreditCard,
        content: <AdminCreditSettingsTab />,
      },
      {
        key: "autoMatch",
        label: "기공소 매칭",
        icon: FlaskConical,
        content: <PracticeTransferAutoMatchTab />,
      },
      {
        key: "labFees",
        label: "기공소 수가",
        icon: Banknote,
        content: <AdminLabFeeSchedulesTab />,
      },
    ],
    [],
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
    />
  );
};
