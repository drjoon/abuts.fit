// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/backend/controllers/businesses/business.demoMode.util.js

/** 데모 모드 초기 크레딧(원). 백엔드 DEMO_CREDIT_AMOUNT 와 동기. */
export const DEMO_CREDIT_AMOUNT = 1_000_000;

/** 데모 모드 유효기간(일). 백엔드 DEMO_MODE_DURATION_DAYS 와 동기. */
export const DEMO_MODE_DURATION_DAYS = 30;

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
  "데모 체험용 크레딧(100만 원, 가입 후 30일)입니다. 치과↔기공소 기공의뢰(보철 기공비) 차감에만 쓰입니다. 스토어·커스텀어벗 생산(기공소가 디자인을 올리고 생산을 시작할 때)은 유료/무료 크레딧으로 결제됩니다. 크레딧 소진·30일 만료·실사용 전환 시 잔여 데모 크레딧은 회수됩니다.";

/** 정산 현재 잔액 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  "데모 모드입니다. 데모 크레딧은 기공의뢰 보철 기공비에만 적용되고, 스토어·커스텀어벗 생산은 유료/무료 크레딧으로 결제됩니다. 가입 후 30일 또는 잔액 소진 시 자동으로 실사용 전환됩니다.";

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

export const CREDIT_DEMO_BUCKET_LABEL = "데모 충전";

/** 정산 기간 소비 카드 — 데모 모드 툴팁. */
export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT =
  "데모 모드에서 기공의뢰(치과 차감)는 데모 크레딧, 스토어·커스텀어벗 생산은 유료/무료 크레딧으로 차감된 합계입니다.";

/** 정산 내역/통계 — 데모·실사용 구분 필터 안내. */
export const CREDIT_USAGE_SCOPE_FILTER_HINT =
  "데모와 실사용(유료·일반 무료)을 구분해 보세요. 실사용만 보면 잔액 수식과 맞습니다.";

/** 기공소 PTX — 어벗 디자인/생산 시 실크레딧 부족 안내. */
export const PTX_CA_INSUFFICIENT_CREDIT_TITLE = "크레딧이 부족합니다";

export const PTX_CA_INSUFFICIENT_CREDIT_DESCRIPTION_LINES = [
  "어벗 디자인을 올리고 생산을 시작할 때 유료/무료 크레딧으로 결제됩니다.",
  "데모 크레딧은 사용할 수 없습니다.",
  "충전 후 다시 업로드해 주세요.",
] as const;

export const PTX_CA_INSUFFICIENT_CREDIT_CONFIRM_LABEL = "충전하기";

export const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";
