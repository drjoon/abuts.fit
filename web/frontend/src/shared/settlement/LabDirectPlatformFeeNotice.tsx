// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/pages/admin/AdminPaymentsPage.tsx
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
// change-log:
// - 2026-10-05: 화면 미노출(미부과). 컴포넌트는 재개용으로 유지.
// - 2026-09-27: 플랫폼 사용료 2% 복원. 이벤트 중 ~~2%~~ → 면제(0%). 관리자 feeRates 그대로 받기.
// - 2026-09-26: 수수료 안내 — 협력은 수수료 없이 전액, 하청은 영업 수수료를 제한 적립.
// - 2026-09-26: 플랫폼 사용료·영업 수수료 안내를 기공소 정책과 같은 문장으로 통일.
// - 2026-09-24: 이벤트 0% 안내에 정책 요율 취소선(예: ~~2%~~ → 0%) 표시. 카피「플랫폼 사용료」.
// - 2026-09-20: 적용 on — 작업시작 적립 시 공제 안내.
import type { ReactNode } from "react";
import {
  LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
  LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT,
  resolveLabDirectPlatformFeePct,
  resolveLabFeeDisplay,
  resolveLabSubcontractSalesFeePct,
  type LabFeeRatesLike,
} from "@/shared/settlement/labPayoutBankbook";

type FeeOpts = {
  /** 관리자 설정 원본. 있으면 enabled·ratePct·subcontractRatePct보다 우선. */
  feeRates?: LabFeeRatesLike | null;
  /** 플랫폼 사용료 적용. false·없음 = 이벤트 면제 */
  enabled?: boolean;
  /** 플랫폼 사용료 정책 요율. 0~100 퍼센트 포인트 */
  ratePct?: number;
  /** 하청 영업 수수료. 0~100 퍼센트 포인트 */
  subcontractRatePct?: number;
};

function resolveOpts(opts: FeeOpts) {
  if (opts.feeRates) {
    const d = resolveLabFeeDisplay(opts.feeRates);
    return {
      enabled: d.platformEnabled,
      pct: d.platformPct,
      salesPct: d.subcontractPct,
    };
  }
  return {
    enabled: opts.enabled === true,
    pct: resolveLabDirectPlatformFeePct(opts.ratePct),
    salesPct: resolveLabSubcontractSalesFeePct(opts.subcontractRatePct),
  };
}

function FeePct({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold tabular-nums text-slate-900">{children}</span>
  );
}

/** 적용 중이면 정책%. 이벤트면 ~~정책%~~ → 면제(0%). */
export function LabDirectPlatformFeeRateLabel(opts: FeeOpts): ReactNode {
  const { enabled, pct } = resolveOpts(opts);
  if (enabled) return <FeePct>{pct}%</FeePct>;
  return (
    <>
      <span className="tabular-nums text-slate-400 line-through">{pct}%</span>
      <span className="font-semibold tabular-nums text-slate-900">
        {" "}
        → 면제(0%)
      </span>
    </>
  );
}

/** 기공소 플랫폼 사용료·하청 영업 수수료 안내. 2026-10-05부터 화면 미노출(미부과). 재개 시 정책 모달에 다시 연결. */
export function LabDirectPlatformFeeNotice({
  suffix,
  ...opts
}: FeeOpts & { suffix?: ReactNode }): ReactNode {
  const { enabled, salesPct } = resolveOpts(opts);
  return (
    <>
      기공소의 플랫폼 사용료는 매출액의 <LabDirectPlatformFeeRateLabel {...opts} />
      입니다.
      {enabled ? null : (
        <>
          <br />
          이벤트 기간 동안 플랫폼 사용료를 면제합니다.
        </>
      )}
      <br />
      협력건과 하청건 모두 플랫폼 사용료를 차감하고 크레딧으로 적립합니다.
      <br />
      하청건은 <FeePct>{salesPct}%</FeePct> 영업 수수료가 추가로 차감됩니다.
      {suffix}
    </>
  );
}

export {
  LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
  LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT,
};
