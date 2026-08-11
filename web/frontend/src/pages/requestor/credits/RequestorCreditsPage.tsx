// change-log:
// - 2026-08-11: 대시보드 헤더 [보유 크레딧]을 사이드바 크레딧 페이지로 이전 (내역/충전 탭).
// - 2026-08-11: 기공소 결제크레딧 정산 탭 추가.
// - 2026-08-11: 정산 탭을 제조사 정산 UX(일별 집계·입금 내역)로 확장. 넓은 레이아웃 적용.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/features/settings/tabs/CreditPaymentTab.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Wallet, Landmark } from "lucide-react";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { PaymentTab } from "@/features/settings/tabs/CreditPaymentTab";
import { LabSettlementPayoutTab } from "@/features/settings/tabs/LabSettlementPayoutTab";
import { CreditLedgerModal } from "@/shared/components/CreditLedgerModal";
import { useAuthStore } from "@/store/useAuthStore";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

type TabKey = "ledger" | "charge" | "settlement";

const CHARGE_TAB_PATH = "/dashboard/credits?tab=charge";

export default function RequestorCreditsPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab";

  const tabs = useMemo<SettingsTabDef[]>(() => {
    const list: SettingsTabDef[] = [
      {
        key: "ledger",
        label: "내역",
        icon: Wallet,
        content: (
          <div className="h-[min(70vh,720px)] min-h-[420px]">
            <CreditLedgerModal
              embedded
              chargeNavPath={CHARGE_TAB_PATH}
              className="h-full"
            />
          </div>
        ),
      },
      {
        key: "charge",
        label: "충전",
        icon: CreditCard,
        content: <PaymentTab userData={user || {}} />,
      },
    ];
    if (isLab) {
      list.push({
        key: "settlement",
        label: "결제크레딧 정산",
        icon: Landmark,
        content: <LabSettlementPayoutTab />,
      });
    }
    return list;
  }, [isLab, user]);

  const tabFromUrl = (searchParams.get("tab") as TabKey | null) || "ledger";
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl) ? tabFromUrl : "ledger";

  return (
    <SettingsScaffold
      tabs={tabs}
      activeTab={activeTab}
      contentMaxClassName={
        activeTab === "settlement" ? "max-w-6xl" : "max-w-4xl"
      }
      onTabChange={(next) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("tab", next);
        setSearchParams(nextParams, { replace: true });
      }}
    />
  );
}
