// change-log:
// - 2026-10-08: 딜러 대시보드 누적 구간 클릭과 정산 페이지가 같은 분배몫 본문을 쓴다.
import { CustomAbutmentDealerSplitTable } from "@/shared/settlement/CustomAbutmentSplitPolicyTables";
import {
  GUIDE_FACT_GRID_CLASS,
  SettlementPolicyFact,
} from "@/shared/settlement/settlementUi";
import {
  REFERRAL_OWNERSHIP_INACTIVE_DAYS,
  REFERRAL_OWNERSHIP_RESET_ANYONE_LINE,
} from "@/shared/sales/dealershipPolicyCopy";

/** 딜러 정산 규칙 — 커스텀어벗 누적 분배 표와 지급 조건. */
export function DealerSettlementRulesContent({
  payoutDayOfMonth = 1,
}: {
  payoutDayOfMonth?: number;
}) {
  const payoutDay = Number(payoutDayOfMonth || 1);
  return (
    <div className="space-y-4">
      <CustomAbutmentDealerSplitTable />
      <div className={GUIDE_FACT_GRID_CLASS}>
        <SettlementPolicyFact label="제외">
          기공 · 스토어 · 배송비 · 월정액
        </SettlementPolicyFact>
        <SettlementPolicyFact label="소개 코드">
          {REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면 리셋됩니다.
          <br />
          {REFERRAL_OWNERSHIP_RESET_ANYONE_LINE}
        </SettlementPolicyFact>
        <SettlementPolicyFact label="세금계산서">
          지급은 잔액 그대로입니다.
          <br />
          ÷1.1로 공급가·세액을 나눕니다.
        </SettlementPolicyFact>
        <SettlementPolicyFact label="지급">
          사업자 단위 · 매월 {payoutDay}일
          <br />
          무료 의뢰·배송은 지급 대상이 아닙니다.
        </SettlementPolicyFact>
      </div>
    </div>
  );
}
