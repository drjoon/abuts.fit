// related files:
// - web/backend/jobs/fmDentalShippingBillingWorker.js
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/backend/models/ledgerJournal.model.js
// change-log:
// - 2026-10-31: 월정액 저널 사락 코드 제거. 워커는 disabled stub만 호출.
// - 2026-10-13: 월정액 원가 저널 중단(딜리버리는 딜러가 직접 지급). 택배비는 박스별 딜러 차감.
// - 2026-10-13: 딜리버리 배송으로 지정된 거래처만 월정액 원가 대상.
// - 2026-10-13: 딜러 거래처는 적립에서 빼지 않는다. 적립 총액을 입금하고, 딜러사가 딜리버리 회사에 직접 입금한다. 기존 차감 저널은 삭제.
// - 2026-10-08: 월 의뢰 2건 이하 거래처는 배송업체 무료 → 원가 미기록.
// - 2026-10-08: 딜리버리 월정액(거래처 1곳당 55,000원 VAT 포함)은 딜러 부담(딜러 정산에서 차감). 딜러 없으면 어벗츠 부담.
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import { DELIVERY_FREE_MAX_MONTHLY_REQUESTS } from "../utils/requestorUnitPricePolicy.js";
import { deleteGeneralLedgerCommitJournal } from "./generalLedger.service.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";

/** @returns {{ startYmd: string, endYmd: string, ym: string, start: Date, end: Date }} 직전 달(KST). */
export function resolvePreviousMonthKst(todayYmd = getTodayYmdInKst()) {
  const [y, m] = String(todayYmd).split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const ym = `${py}-${String(pm).padStart(2, "0")}`;
  const startYmd = `${ym}-01`;
  const endYmd = `${y}-${String(m).padStart(2, "0")}-01`;
  return {
    ym,
    startYmd,
    endYmd,
    start: new Date(`${startYmd}T00:00:00+09:00`),
    end: new Date(`${endYmd}T00:00:00+09:00`),
  };
}

/**
 * 예전에 딜러 적립에서 뺀 딜리버리 월정액 저널을 지운다.
 * 지우면 미지급 잔액이 적립 총액으로 돌아간다.
 */
export async function voidDealerDeliveryMonthlyDeductions() {
  const [byLine, byMeta] = await Promise.all([
    LedgerLine.find({ accountCode: "REV_SALESMAN", refType: "DELIVERY_MONTHLY" })
      .select({ journalId: 1 })
      .lean(),
    LedgerJournal.find({
      eventType: "DELIVERY_MONTHLY_COST",
      "meta.dealerAnchorId": { $nin: [null, ""] },
    })
      .select({ journalId: 1 })
      .lean(),
  ]);
  const ids = [
    ...new Set(
      [...byLine, ...byMeta]
        .map((row) => String(row.journalId || "").trim())
        .filter(Boolean),
    ),
  ];
  let voided = 0;
  for (const journalId of ids) {
    const res = await deleteGeneralLedgerCommitJournal({
      journalId,
      expectedEventTypes: ["DELIVERY_MONTHLY_COST"],
    });
    if (res?.deleted) voided += 1;
  }
  return voided;
}

/** 직전 달 의뢰 건수가 무료 구간(2건 이하)이면 월정액 원가가 없다. */
export function isDeliveryMonthlyCostBillable(monthlyRequestCount) {
  return Math.floor(Number(monthlyRequestCount) || 0) > DELIVERY_FREE_MAX_MONTHLY_REQUESTS;
}

/**
 * 딜리버리 월정액 저널은 중단. 판매자–딜리버리사 직접 계약이라 어벗츠는 관여하지 않는다.
 * 택배는 박스마다 판매자 적립에서 차감한다(common.review.helpers.js postDealerParcelShippingDeduction).
 */
export async function processDeliveryMonthlyCosts({ now = new Date(), dryRun = false } = {}) {
  const prev = resolvePreviousMonthKst(getTodayYmdInKst(now));
  const voided = dryRun ? 0 : await voidDealerDeliveryMonthlyDeductions();
  return { ym: prev.ym, customers: 0, billable: 0, dealerDirect: 0, posted: 0, voided, reason: "disabled" };
}
