// change-log:
// - 2026-08-26: 데모 뱃지 — 탭 바 max-w-4xl 유지, 뱃지만 max-w-6xl 우측 끝.
// - 2026-08-26: 데모 모드 뱃지(탭 바 우측). 실사용 전환 확인.
// - 2026-08-22: 정산 페이지 탭 순서 — 내역·통계·충전. 사이드바 라벨 정산.
// - 2026-08-19: 크레딧 페이지 진입 시 사업자 me를 기다리지 않음. 충전 탭은 열 때만 마운트.
// - 2026-08-14: 기공크레딧(정산) 탭 제거. 내역·충전만. ?tab=settlement → ledger.
// - 2026-08-14: 내역 탭 UI를 기공크레딧 탭과 동일 최신 스타일로 정리(CreditLedgerModal).
// - 2026-08-13: 기공소 정산 탭 라벨을 「기공크레딧」으로 통일.
// - 2026-08-12: 충전 탭 안내문(기공료 선입금)이 잘리지 않도록 overflow-auto.
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
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/shared/ui/skeletons/RequestorCreditsPageSkeleton.tsx
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, BarChart3, Wallet } from "lucide-react";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { PaymentTab } from "@/features/settings/tabs/CreditPaymentTab";
import { CreditLedgerModal } from "@/shared/components/CreditLedgerModal";
import { DemoModeBadge } from "@/shared/demo/DemoModeBadge";
import { useAuthStore } from "@/store/useAuthStore";

import { CreditStatisticsTab } from "@/pages/requestor/credits/components/CreditStatisticsTab";

type TabKey = "ledger" | "stats" | "charge";

export default function RequestorCreditsPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ledgerKey, setLedgerKey] = useState(0);
  const tabFromUrl = (searchParams.get("tab") as TabKey | null) || "ledger";
  const activeTab: TabKey =
    tabFromUrl === "charge"
      ? "charge"
      : tabFromUrl === "stats"
        ? "stats"
        : "ledger";

  const handleDemoExited = useCallback(() => {
    setLedgerKey((n) => n + 1);
  }, []);

  const tabs = useMemo<SettingsTabDef[]>(
    () => [
      {
        key: "ledger",
        label: "내역",
        icon: Wallet,
        content: (
          <div className="h-full min-h-0 overflow-hidden">
            <CreditLedgerModal
              key={ledgerKey}
              embedded
              className="h-full"
            />
          </div>
        ),
      },
      {
        key: "stats",
        label: "통계",
        icon: BarChart3,
        content:
          activeTab === "stats" ? (
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden px-0.5 pb-2 pt-2">
              <CreditStatisticsTab />
            </div>
          ) : null,
      },
      {
        key: "charge",
        label: "충전",
        icon: CreditCard,
        content:
          activeTab === "charge" ? (
            <div className="flex h-full min-h-0 items-start justify-center overflow-auto px-0.5 pt-1 sm:items-center sm:pt-0">
              <div className="mx-auto w-full max-w-4xl">
                <PaymentTab userData={user || {}} compact />
              </div>
            </div>
          ) : null,
      },
    ],
    [activeTab, user, ledgerKey],
  );

  return (
    <div className="h-full min-h-0" data-guide-tour="credits_workspace">
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        tabsMaxClassName="max-w-4xl"
        contentMaxClassName="max-w-6xl"
        fillHeight
        tabsTrailing={<DemoModeBadge onExited={handleDemoExited} />}
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </div>
  );
}
