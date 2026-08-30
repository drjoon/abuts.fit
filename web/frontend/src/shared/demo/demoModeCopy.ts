// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/backend/controllers/businesses/business.demoMode.util.js

/** 데모 모드 초기 크레딧(원). 백엔드 DEMO_CREDIT_AMOUNT 와 동기. */
export const DEMO_CREDIT_AMOUNT = 10_000_000;

export const DEMO_MODE_BADGE_LABEL = "데모";

export const DEMO_MODE_EXIT_TITLE = "실사용으로 전환할까요?";

/** 실사용 전환 확인 본문(줄 단위). ConfirmDialog 에 줄바꿈으로 렌더. */
export const DEMO_MODE_EXIT_DESCRIPTION_LINES = [
  "남은 데모 크레딧은 회수됩니다.",
  "이후 기공비는 유료 크레딧으로 결제됩니다.",
  "전환 후에는 데모 모드로 되돌릴 수 없습니다.",
] as const;

export const DEMO_MODE_EXIT_DESCRIPTION =
  DEMO_MODE_EXIT_DESCRIPTION_LINES.join("\n");

export const DEMO_MODE_EXIT_CONFIRM_LABEL = "실사용으로 전환";

/** 정산 내역 — 데모 충전 카드 툴팁. */
export const CREDIT_LEDGER_DEMO_NOTICE_BODY =
  "데모 체험용 크레딧입니다. 치과↔기공소 기공의뢰 차감에만 쓰이며, 스토어·커스텀어벗 생산의뢰는 유료/무료 크레딧으로 결제됩니다. 실사용 전환 시 잔여 데모 크레딧은 회수됩니다.";

/** 정산 현재 잔액 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  "데모 모드입니다. 데모 크레딧은 기공의뢰(치과↔기공소)에만 적용되고, 스토어·커스텀어벗은 유료/무료 크레딧으로 결제됩니다.";

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

export const CREDIT_DEMO_BUCKET_LABEL = "데모 충전";

/** 정산 기간 소비 카드 — 데모 모드 툴팁. */
export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT =
  "데모 모드에서 기공의뢰는 데모 크레딧, 스토어·커스텀어벗은 유료/무료 크레딧으로 차감된 합계입니다.";
