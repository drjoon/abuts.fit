// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// change-log:
// - 2026-09-20: 이벤트 0% 안내에 정책 요율 취소선(예: ~~2%~~ → 0%) 표시.
import type { ReactNode } from "react";
import {
  LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
  resolveLabDirectPlatformFeePct,
} from "@/shared/settlement/labPayoutBankbook";

type FeeOpts = {
  enabled?: boolean;
  /** 0~100 퍼센트 포인트 */
  ratePct?: number;
};

/** 정책% 취소선 → 0% (이벤트). 적용 on이면 요율만. */
export function LabDirectPlatformFeeRateLabel({
  enabled,
  ratePct,
}: FeeOpts): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  if (enabled === true) {
    return <span className="tabular-nums">{pct}%</span>;
  }
  return (
    <>
      <span className="tabular-nums text-slate-400 line-through">{pct}%</span>
      <span className="tabular-nums"> → 0%</span>
    </>
  );
}

/** 지정 기공소 플랫폼 수수료 안내 문장. */
export function LabDirectPlatformFeeNotice({
  enabled,
  ratePct,
  suffix,
}: FeeOpts & { suffix?: ReactNode }): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  if (enabled === true) {
    return (
      <>
        지정 기공소 의뢰의 플랫폼 수수료는 매출액의{" "}
        <span className="font-semibold tabular-nums text-slate-900">{pct}%</span>
        입니다.
        {suffix}
      </>
    );
  }
  return (
    <>
      지정 기공소 의뢰의 플랫폼 수수료는{" "}
      <LabDirectPlatformFeeRateLabel enabled={false} ratePct={pct} />
      입니다.
      {suffix}
    </>
  );
}

export { LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT };
