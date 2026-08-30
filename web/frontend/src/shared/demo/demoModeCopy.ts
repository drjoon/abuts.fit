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
  "이후 기공비·커스텀어벗 생산비는 유료 크레딧으로 결제됩니다.",
  "전환 후에는 데모 모드로 되돌릴 수 없습니다.",
] as const;

export const DEMO_MODE_EXIT_DESCRIPTION =
  DEMO_MODE_EXIT_DESCRIPTION_LINES.join("\n");

export const DEMO_MODE_EXIT_CONFIRM_LABEL = "실사용으로 전환";

/** 정산 내역 — 데모 충전 카드 툴팁. */
export const CREDIT_LEDGER_DEMO_NOTICE_BODY =
  "데모 체험용 크레딧입니다. 앱의 기공의뢰·커스텀어벗 등 기능을 유료/무료 크레딧처럼 사용할 수 있습니다. 다만 실제 기공비·커스텀어벗 생산비는 기존과 같이 해당 기공소에 직접 지급해 주세요. 실사용 전환 시 잔여 데모 크레딧은 회수됩니다.";

/** 정산 현재 잔액 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  "데모 모드입니다. 잔액은 데모 크레딧을 포함합니다. 기공비·커스텀어벗 생산비는 기공소에 직접 결제하고, 앱에서는 기능 체험용으로 차감됩니다.";

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

export const CREDIT_DEMO_BUCKET_LABEL = "데모 충전";

/** 정산 충전 탭 — 데모 모드에서 유료 입금 차단 안내. */
export const CREDIT_DEMO_CHARGE_BLOCKED_BODY =
  "데모 모드에서는 유료 충전(입금)과 계산서 발행을 하지 않습니다. 데모 크레딧으로 기능을 체험한 뒤, 실사용으로 전환하면 유료 충전을 이용할 수 있습니다.";
