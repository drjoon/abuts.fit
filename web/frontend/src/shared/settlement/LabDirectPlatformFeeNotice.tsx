// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// change-log:
// - 2026-09-26: AI 학습 이용 동의·면제·변경 시점(미완료 의뢰부터) 안내.
// - 2026-09-24: 이벤트 0% 안내에 정책 요율 취소선(예: ~~2%~~ → 0%) 표시. 카피「플랫폼 사용료」.
// - 2026-09-20: 적용 on — 작업시작 적립 시 공제 안내.
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

/** 정책 요율. 학습 이용을 허용하면 면제. */
export function LabDirectPlatformFeeRateLabel({
  ratePct,
}: FeeOpts): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  return <span className="tabular-nums">{pct}%</span>;
}

/** 지정·협력 플랫폼 사용료와 학습 이용 면제. */
export function LabDirectPlatformFeeNotice({
  ratePct,
  suffix,
}: FeeOpts & { suffix?: ReactNode }): ReactNode {
  const pct = resolveLabDirectPlatformFeePct(ratePct);
  return (
    <>
      지정·협력 의뢰의 플랫폼 사용료는 작업시작 적립 시 매출액의{" "}
      <span className="font-semibold tabular-nums text-slate-900">{pct}%</span>
      입니다.
      <br />
      AI 학습 이용에 동의하면, 작업 완료 때 올리는 3D 모델을 학습에 사용합니다.
      <br />
      허용하면 이 플랫폼 사용료가 면제되고, 허용하지 않으면 공제됩니다.
      <br />
      어벗츠기공소는 항상 허용으로 보며 사용료가 없습니다.
      <br />
      동의는 설정에서 바꿀 수 있고, 바꾸면 아직 끝나지 않은 이번 의뢰부터
      적용됩니다.
      <br />
      완료·취소된 의뢰는 바꾸지 않습니다.
      {suffix}
    </>
  );
}

export { LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT };
