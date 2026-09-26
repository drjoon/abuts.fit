// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/pages/admin/AdminPaymentsPage.tsx
// change-log:
// - 2026-09-26: 플랫폼 사용료·영업 수수료 안내를 기공소 정책과 같은 문장으로 통일.
// - 2026-09-24: 이벤트 0% 안내에 정책 요율 취소선(예: ~~2%~~ → 0%) 표시. 카피「플랫폼 사용료」.
// - 2026-09-20: 적용 on — 작업시작 적립 시 공제 안내.
import type { ReactNode } from "react";
import {
  LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
  LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT,
  resolveLabDirectPlatformFeePct,
  resolveLabSubcontractSalesFeePct,
} from "@/shared/settlement/labPayoutBankbook";

type FeeOpts = {
  /** 0~100 퍼센트 포인트 */
  ratePct?: number;
  /** 하청 영업 수수료. 0~100 퍼센트 포인트 */
  subcontractRatePct?: number;
};

function FeePct({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold tabular-nums text-slate-900">{children}</span>
  );
}

/** 정책 요율. 학습 이용을 허용하면 면제. */
export function LabDirectPlatformFeeRateLabel({
  ratePct,
}: Pick<FeeOpts, "ratePct">): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  return <span className="tabular-nums">{pct}%</span>;
}

/** 기공소 플랫폼 사용료·하청 영업 수수료·학습 이용 면제. */
export function LabDirectPlatformFeeNotice({
  ratePct,
  subcontractRatePct,
  suffix,
}: FeeOpts & { suffix?: ReactNode }): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  const salesPct = resolveLabSubcontractSalesFeePct(subcontractRatePct);
  return (
    <>
      기공소의 플랫폼 사용료는 매출액의 <FeePct>{pct}%</FeePct>
      입니다.
      <br />
      협력건이나 하청건 모두 플랫폼 사용료를 차감하고 크레딧 적립됩니다.
      <br />
      협력건은 별도의 영업 수수료가 없으며, 하청건은 <FeePct>{salesPct}%</FeePct>
      의 영업 수수료가 추가됩니다.
      <br />
      <br />
      작업 결과를 AI 학습에 이용할 수 있도록 동의하면, 플랫폼 사용료(
      <FeePct>{pct}%</FeePct>
      )가 면제됩니다.
      {suffix}
    </>
  );
}

export {
  LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
  LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT,
};
