// change-log:
// - 2026-08-12: 치과는 기공크레딧 UI 미노출(유료크레딧으로 기공비 지불). 기공소만 정산 탭.
// - 2026-08-11: accessLoading early return 전에 useMemo 호출(Rules of Hooks).
// - 2026-08-11: access 로딩 시 페이지 스켈레톤.
// - 2026-08-11: 상단 탭 바를 문의 페이지와 동일 max-w-4xl·상단 고정.
// - 2026-08-11: 내역 탭 우측 상단 [충전] 버튼 제거(충전 탭으로 이동).
// - 2026-08-11: 작업영역 높이 채움 + 충전 카드 수직 중앙. 내역 테이블 영역 고정 높이로 무한스크롤.
// - 2026-08-11: 충전 탭 — 수직 스크롤 없이 남은 영역 수직 중앙 배치(fillHeight).
// - 2026-08-11: 내역 테이블 높이 — 정산 탭처럼 뷰포트 하단까지 조금 더 길게.
// - 2026-08-11: 충전 탭 외곽 카드 제거 + 입금정보/금액 패널 수직 중앙 배치.
// - 2026-08-11: 내역/충전 탭도 정산과 동일 max-w-6xl. 충전 카드만 max-w-4xl 중앙 유지.
// - 2026-08-11: 대시보드 헤더 [보유 크레딧]을 사이드바 크레딧 페이지로 이전 (내역/충전 탭).
// - 2026-08-11: 기공소 기공크레딧 정산 탭 추가.
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
import { RequestorCreditsPageSkeleton } from "@/shared/ui/skeletons/RequestorCreditsPageSkeleton";

type TabKey = "ledger" | "charge" | "settlement";

export default function RequestorCreditsPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loading: accessLoading, kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab";

  // Hooks must run unconditionally (before accessLoading early return).
  const tabs = useMemo<SettingsTabDef[]>(() => {
    const list: SettingsTabDef[] = [
      {
        key: "ledger",
        label: "내역",
        icon: Wallet,
        content: (
          <div className="h-full min-h-0 overflow-hidden">
            <CreditLedgerModal embedded className="h-full" />
          </div>
        ),
      },
      {
        key: "charge",
        label: "충전",
        icon: CreditCard,
        content: (
          <div className="flex h-full min-h-0 items-center justify-center overflow-hidden">
            <div className="mx-auto w-full max-w-4xl">
              <PaymentTab userData={user || {}} compact />
            </div>
          </div>
        ),
      },
    ];
    if (isLab) {
      list.push({
        key: "settlement",
        label: "기공크레딧 정산",
        icon: Landmark,
        content: (
          <div className="h-full min-h-0 overflow-auto">
            <LabSettlementPayoutTab />
          </div>
        ),
      });
    }
    return list;
  }, [isLab, user]);

  if (accessLoading) {
    return (
      <div className="h-full min-h-0">
        <RequestorCreditsPageSkeleton tabCount={isLab ? 3 : 2} />
      </div>
    );
  }

  const tabFromUrl = (searchParams.get("tab") as TabKey | null) || "ledger";
  const allowed = new Set(tabs.map((t) => t.key));
  const activeTab = allowed.has(tabFromUrl) ? tabFromUrl : "ledger";

  return (
    <div className="h-full min-h-0">
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        tabsMaxClassName="max-w-4xl"
        contentMaxClassName="max-w-6xl"
        fillHeight
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </div>
  );
}
