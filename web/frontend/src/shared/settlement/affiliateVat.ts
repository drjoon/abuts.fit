// change-log:
// - 2026-08-18: 제조사는 기공소(면세) 등록 — 과세 대상에서 제외.
// - 2026-08-17: 과세=어벗츠↔영업자·개발운영사 지급. 면세=치과·기공소·제조사·어벗츠(관리자).
// related files:
// - rules.md
// - web/frontend/rules.md
// - web/frontend/src/shared/settlement/settlementUi.tsx

/** 관계사(영업자·개발운영사) 지급 부가세율. 루트 rules.md §2.3. */
export const AFFILIATE_VAT_RATE = 0.1;

export type AffiliateVatSplit = {
  supply: number;
  vat: number;
  total: number;
};

export function roundWon(value: number): number {
  return Math.round(Number(value || 0));
}

export function splitAffiliateVat(
  supplyAmount: number,
  rate: number = AFFILIATE_VAT_RATE,
): AffiliateVatSplit {
  const supply = roundWon(supplyAmount);
  const vat = roundWon(supply * Number(rate || 0));
  return { supply, vat, total: supply + vat };
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

/** 과세 지급(영업자·개발운영사): 세금계산서. */
export const SETTLEMENT_TAXABLE_INVOICE_LABEL = "세금계산서";
/** 면세 경로(치과·기공소·제조사·어벗츠=관리자): 계산서. */
export const SETTLEMENT_EXEMPT_INVOICE_LABEL = "계산서";

/** 과세 정산 화면 공통 안내. 행마다 VAT를 붙이지 않는다. */
export const SETTLEMENT_VAT_PAYOUT_NOTICE =
  "장부 금액은 공급가입니다. 부가세 10%는 지급 시 합산하며 세금계산서를 수취합니다.";

/** 면세 정산 화면 공통 안내. */
export const SETTLEMENT_EXEMPT_PAYOUT_NOTICE =
  "면세 기공소입니다. 부가세 없이 지급하며 계산서를 발행합니다.";

export const SETTLEMENT_VAT_POLICY = {
  taxable:
    "부가세는 어벗츠가 영업자·개발운영사에게 지급할 때 붙습니다. 지급액에 부가세 10%를 더하고 세금계산서를 수취합니다.",
  exempt:
    "치과·기공소·제조사·어벗츠(관리자) 사이는 면세입니다. 부가세가 없고 세금계산서가 아닌 계산서를 발행합니다.",
  manufacturerEarn:
    "하청 적립은 공급가입니다. 제조사는 기공소(면세)로 등록되어 부가세 없이 지급합니다. 유료만 지급하며 무료는 확인용(지급 0)입니다.",
  salesmanPayout:
    "영업자 수수료 장부는 공급가입니다. 지급 시 부가세 10%를 더해 세금계산서를 수취합니다.",
  devopsPayout:
    "개발운영사 잔여 분배 장부는 공급가입니다. 지급 시 부가세 10%를 더해 세금계산서를 수취합니다.",
  adminExempt:
    "어벗츠(관리자) 잔여 분배는 면세입니다. 부가세 없이 계산서를 발행합니다.",
} as const;
