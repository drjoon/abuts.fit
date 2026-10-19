// change-log:
// - 2026-10-19: 개인 기공소 공급자 모델은 폐기. flag는 끄고 둔다. 기공사업부 계산서는 법인(ABUTS_TO_CUSTOMER).
// - 2026-10-15: 어벗츠기공소(개인 개설) 정산 구조 정렬용 feature flag.
// related files:
// - web/backend/services/customerMonthlyInvoice.service.js
// - web/backend/services/settlement.service.js
// - web/backend/services/practiceTransferBilling.service.js
// - rules.md §2.3
//
// 법적 구조(2026-10-19): 개인 어벗츠기공소는 열지 않는다.
// 기공소업은 어벗츠 주식회사의 기공사업부다. 치과 입금·계산서 공급자는 법인.
// 아래 flag는 개인 기공소를 공급자로 만들던 경로라 켜지 않는다.

function envOn(name) {
  return String(process.env[name] || "").trim().toLowerCase() === "true";
}

/**
 * PTX 기공비 면세 월합 계산서의 공급자를 어벗츠기공소 앵커로 한다.
 * (위수탁: 어벗츠 주식회사는 팝빌 수탁자, 공급자는 어벗츠기공소)
 */
export const ABUTS_LAB_SELLER_INVOICE_ENABLED = envOn(
  "ABUTS_LAB_SELLER_INVOICE",
);

/**
 * 기공소·제조사 매입(`AFFILIATE_TO_ABUTS`)의 구매자를 어벗츠기공소 앵커로 한다.
 * off면 기존처럼 admin 앵커(어벗츠 주식회사).
 */
export const ABUTS_LAB_PURCHASE_BUYER_ENABLED = envOn(
  "ABUTS_LAB_PURCHASE_BUYER",
);

/**
 * PTX 기공비 에스크로(`PLATFORM_ESCROW`) 소유를 어벗츠기공소 앵커로 한다.
 * 진행 중인 hold는 hold 저널의 소유자로 release한다(호환).
 */
export const ABUTS_LAB_ESCROW_OWNER_ENABLED = envOn("ABUTS_LAB_ESCROW_OWNER");

/**
 * 법인 청구(렌탈·플랫폼 이용료)는 정액(개별 제품 단위 고정 단가)만 허용한다.
 * 매출 비율 분배·정률 사용료 재개는 막는다(의료기사법 명의대여·사실상 개설 시비).
 * 회계사는 세무상 정률도 현실적이라 했으나, 의료기사법 변호사 확인 전까지 유지한다.
 * 정률 허용 시 이 값을 바꾸기 전에 시장가 근거·상한·소장 경영권을 문서에 먼저 남긴다.
 */
export const CORP_FEE_FIXED_ONLY = true;
