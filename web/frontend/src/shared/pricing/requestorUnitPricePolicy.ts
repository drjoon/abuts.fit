// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/salesman/components/CustomerPricePanel.tsx
// - web/frontend/rules.md
// change-log:
// - 2026-10-08: 단일가 1.5만 + 딜러/영업팀 거래처별 가격(1.2~1.5만, 비공개). 그룹할인·가입 이벤트 폐지.

/** 기본(공시) 건당 의뢰비(원). 치과·기공소 공통. */
export const REQUESTOR_UNIT_PRICE_BASE = 15_000;
/** 딜러·영업팀이 거래처에 정할 수 있는 최저가(원). */
export const REQUESTOR_UNIT_PRICE_MIN = 12_000;
/** 어벗츠 → 딜러 공급가(원, 부가세 포함). 딜러 수수료 = 판매가 − 공급가. */
export const REQUESTOR_UNIT_PRICE_DEALER_SUPPLY = 10_000;
/** 제조사 매입가(원, 부가세 포함). */
export const REQUESTOR_UNIT_PRICE_MANUFACTURER_COST = 5_500;
/** 딜리버리 월정액(원, 부가세 포함). 거래처 1곳당. */
export const DELIVERY_MONTHLY_FEE = 55_000;
/** 월 의뢰가 이 건수 이하인 거래처는 배송업체가 무료로 처리한다(딜러·어벗츠 부담 없음). */
export const DELIVERY_FREE_MAX_MONTHLY_REQUESTS = 2;

export type RequestorUnitPriceRule = "dealer_price" | "base_price";

export type DealerUnitPriceCheck =
  | { ok: true; price: number }
  | { ok: false; message: string };

export function formatRequestorWon(n: number): string {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
}

/** 딜러 설정가 검증(서버와 동일). 원 단위 정수, 12,000~15,000. */
export function validateDealerUnitPrice(input: unknown): DealerUnitPriceCheck {
  const raw = typeof input === "string" ? input.replace(/[,\s]/g, "") : input;
  const n = Number(raw);
  if (raw === "" || raw == null || !Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: "원 단위 숫자로 입력해 주세요." };
  }
  if (n < REQUESTOR_UNIT_PRICE_MIN || n > REQUESTOR_UNIT_PRICE_BASE) {
    return {
      ok: false,
      message: `${formatRequestorWon(REQUESTOR_UNIT_PRICE_MIN)}원 이상 ${formatRequestorWon(REQUESTOR_UNIT_PRICE_BASE)}원 이하로 입력해 주세요.`,
    };
  }
  return { ok: true, price: n };
}

/** 딜러 수수료(부가세 포함) = 판매가 − 1만원. */
export function dealerCommissionOf(salePrice: number): number {
  return Math.max(
    0,
    Math.round(Number(salePrice) || 0) - REQUESTOR_UNIT_PRICE_DEALER_SUPPLY,
  );
}
