// change-log:
// - 2026-08-23: 제조사=일반과세. 매입가(부가세 포함) 분해·지급 시 VAT·세금계산서.
// - 2026-08-20: 제조사는 유료·무료 구분 없이 약정 단가 전액. 말일 일괄 지급 전까지 미정산.
// - 2026-08-18: (철회) 제조사 면세 — 일반과세로 복귀.
// - 2026-08-17: 과세=어벗츠↔제조사·영업자·개발운영사 지급. 면세=치과·기공소·어벗츠(관리자).
// related files:
// - rules.md
// - web/frontend/rules.md
// - web/frontend/src/shared/settlement/settlementUi.tsx

/** 관계사(제조사·딜러사·개발운영사) 지급 부가세율. 루트 rules.md §2.3. */
export const AFFILIATE_VAT_RATE = 0.1;

export type AffiliateVatSplit = {
  supply: number;
  vat: number;
  total: number;
};

export function roundWon(value: number): number {
  return Math.round(Number(value || 0));
}

/** 공급가 → 부가세·합계. */
export function splitAffiliateVat(
  supplyAmount: number,
  rate: number = AFFILIATE_VAT_RATE,
): AffiliateVatSplit {
  const supply = roundWon(supplyAmount);
  const vat = roundWon(supply * Number(rate || 0));
  return { supply, vat, total: supply + vat };
}

/** 부가세 포함가 → 공급가·세액(제조사 매입가 SSOT). */
export function splitInclusiveVat(
  inclusiveAmount: number,
  rate: number = AFFILIATE_VAT_RATE,
): AffiliateVatSplit {
  const total = roundWon(inclusiveAmount);
  const r = Number(rate || 0);
  if (!Number.isFinite(r) || r <= 0) {
    return { supply: total, vat: 0, total };
  }
  const supply = roundWon(total / (1 + r));
  const vat = total - supply;
  return { supply, vat, total };
}

export function formatWon(value?: number): string {
  return `₩${roundWon(value || 0).toLocaleString("ko-KR")}`;
}

export function formatWonWithUnit(value?: number): string {
  return `${roundWon(value || 0).toLocaleString("ko-KR")}원`;
}

export function vatPctLabel(rate: number = AFFILIATE_VAT_RATE): string {
  return `${Math.round(Number(rate || 0) * 100)}%`;
}

/** 과세 지급(제조사·딜러사·개발운영사): 세금계산서. */
export const SETTLEMENT_TAXABLE_INVOICE_LABEL = "세금계산서";
/** 면세 경로(치과·기공소·어벗츠): 계산서. */
export const SETTLEMENT_EXEMPT_INVOICE_LABEL = "계산서";

/** 과세 정산 화면 공통 안내. 행마다 VAT를 붙이지 않는다. */
export const SETTLEMENT_VAT_PAYOUT_NOTICE =
  "장부 금액은 공급가입니다. 부가세 10%는 지급 시 합산하며 세금계산서를 수취합니다.";

/** 면세 정산 화면 공통 안내. */
export const SETTLEMENT_EXEMPT_PAYOUT_NOTICE =
  "면세 기공소입니다. 부가세 없이 지급하며 계산서를 발행합니다.";

export const SETTLEMENT_VAT_POLICY = {
  taxable:
    "부가세는 어벗츠가 제조사·딜러사·개발운영사에게 지급할 때 붙습니다. 지급액에 부가세 10%를 더하고 세금계산서를 수취합니다.",
  exempt:
    "치과·기공소·어벗츠 사이 기공·커스텀어벗·크레딧은 면세입니다. 부가세가 없고 세금계산서가 아닌 계산서를 발행합니다.",
  storeTaxable:
    "스토어 기성품은 과세입니다. 고객 가격은 부가세 포함가이며 세금계산서를 발행합니다. 커스텀어벗·크레딧 계산서와 합치지 않습니다.",
  manufacturerEarn:
    "하청 적립은 매입가(부가세 포함)의 공급가입니다. 제조사는 일반과세사업자로 지급 시 부가세 10%를 더해 세금계산서를 수취합니다. 고객의 유료·무료 크레딧과 무관하게 모든 의뢰·배송에 약정 단가를 지급하며, 매달 말일 일괄 지급 전까지 미정산 잔액으로 쌓입니다.",
  salesmanPayout:
    "딜러사 수수료 장부는 공급가입니다. 지급 시 부가세 10%를 더해 세금계산서를 수취합니다.",
  devopsPayout:
    "개발운영사 잔여 분배 장부는 공급가입니다. 지급 시 부가세 10%를 더해 세금계산서를 수취합니다.",
  adminExempt:
    "어벗츠 잔여 분배는 면세입니다. 부가세 없이 계산서를 발행합니다.",
} as const;
