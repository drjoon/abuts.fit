// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/backend/controllers/businesses/business.demoMode.util.js

/** @deprecated 신규는 데모 크레딧 미지급. 레거시 상수 동기용. */
export const DEMO_CREDIT_AMOUNT = 0;

/** 데모 모드 유효기간(일). 백엔드 DEMO_MODE_DURATION_DAYS 와 동기. */
export const DEMO_MODE_DURATION_DAYS = 30;

export const DEMO_MODE_BADGE_LABEL = "데모";

export const DEMO_MODE_EXIT_TITLE = "실사용으로 전환할까요?";

/** 실사용 전환 확인 본문(줄 단위). ConfirmDialog 에 줄바꿈으로 렌더. */
export const DEMO_MODE_EXIT_DESCRIPTION_LINES = [
  "데모 기간 중 쌓인 마이너스 잔고는 0원으로 리셋됩니다.",
  "이후 기공비는 유료 크레딧으로 결제됩니다.",
  "치과↔기공소 결산은 기존처럼 양쪽에서 수동으로 처리하세요.",
  "전환 후에는 데모 모드로 되돌릴 수 없습니다.",
] as const;

export const DEMO_MODE_EXIT_DESCRIPTION =
  DEMO_MODE_EXIT_DESCRIPTION_LINES.join("\n");

export const DEMO_MODE_EXIT_CONFIRM_LABEL = "실사용으로 전환";

/** 정산 내역 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_NOTICE_BODY =
  "데모 모드는 크레딧 0원으로 시작합니다. 치과↔기공소 기공의뢰(보철 기공비)는 잔고가 부족해도 마이너스로 진행할 수 있습니다. 스토어·커스텀어벗 생산은 유료/무료 크레딧이 필요합니다. 가입 후 30일 또는 실사용 전환 시 마이너스 잔고는 0으로 리셋됩니다.";

/** 정산 현재 잔액 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  "데모 모드입니다. 기공의뢰 보철 기공비는 마이너스 잔고가 허용되고, 스토어·커스텀어벗 생산은 유료/무료 크레딧으로 결제됩니다. 가입 후 30일 또는 실사용 전환 시 잔고가 리셋됩니다.";

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

export const CREDIT_DEMO_BUCKET_LABEL = "무료 충전";

/** 정산 기간 소비 카드 — 데모 모드 툴팁. */
export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT =
  "데모 모드에서 기공의뢰(치과 차감)와 스토어·커스텀어벗 등 기간 지출 합계입니다.";

/** 기공소 PTX — 어벗 디자인/생산 시 실크레딧 부족 안내. */
export const PTX_CA_INSUFFICIENT_CREDIT_TITLE = "크레딧이 부족합니다";

export const PTX_CA_INSUFFICIENT_CREDIT_DESCRIPTION_LINES = [
  "어벗 디자인을 올리고 생산을 시작할 때 유료/무료 크레딧으로 결제됩니다.",
  "데모 모드의 마이너스 잔고는 기공의뢰 보철 기공비에만 적용됩니다.",
  "충전 후 다시 업로드해 주세요.",
] as const;

export const PTX_CA_INSUFFICIENT_CREDIT_CONFIRM_LABEL = "충전하기";

export const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";
