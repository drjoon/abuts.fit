// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/pages/admin/AdminPaymentsPage.tsx
// change-log:
// - 2026-09-26: 수수료 안내 — 협력은 수수료 없이 전액, 하청은 영업 수수료를 제한 적립.
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

/** @deprecated 플랫폼 사용료는 폐지. 표시는 하청 수수료만. */
export function LabDirectPlatformFeeRateLabel({
  ratePct,
}: Pick<FeeOpts, "ratePct">): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  return <span className="tabular-nums">{pct}%</span>;
}

/** 협력은 수수료 없이 전액 적립. 하청만 영업 수수료를 제한 적립. */
export function LabDirectPlatformFeeNotice({
  subcontractRatePct,
  suffix,
}: FeeOpts & { suffix?: ReactNode }): ReactNode {
  const salesPct = resolveLabSubcontractSalesFeePct(subcontractRatePct);
  return (
    <>
      협력건은 수수료 없이 기공비 전액을 크레딧으로 적립합니다.
      <br />
      하청건은 <FeePct>{salesPct}%</FeePct> 영업 수수료를 제한 나머지를
      적립합니다.
      {suffix}
    </>
  );
}

export {
  LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
  LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT,
};
