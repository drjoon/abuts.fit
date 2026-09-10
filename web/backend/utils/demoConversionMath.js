// related files:
// - web/backend/services/demoConversion.service.js
// - web/backend/utils/creditChargeUnit.js
// change-log:
// - 2026-09-10: 데모 충전 제안 = 이용분 + 이용분/3(100만원 반올림). 하한(이용분+1유닛)과 분리.
export function roundWon(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

/** 알파·제안 금액의 반올림 단위(100만원). */
export const DEMO_SUGGESTION_ROUND_WON = 1_000_000;

/** 이용분+선수금 하한을 충전 유닛으로 올림. */
export function resolveConversionMinTotal({
  demoDebt,
  prepaidMin,
  chargeUnit,
} = {}) {
  const unit = Math.max(1, roundWon(chargeUnit));
  const rawMin = roundWon(demoDebt) + roundWon(prepaidMin);
  return Math.max(unit, Math.ceil(rawMin / unit) * unit);
}

/**
 * 데모 충전 UI 기본·추천액.
 * 소비량(이용분) + 알파(소비량/3, 100만원 반올림). 충전 유닛 정렬 후 하한 이상.
 */
export function resolveDemoChargeSuggestion({
  demoDebt,
  chargeUnit,
  minTotal,
} = {}) {
  const unit = Math.max(1, roundWon(chargeUnit));
  const debt = roundWon(demoDebt);
  const alpha =
    Math.round(debt / 3 / DEMO_SUGGESTION_ROUND_WON) * DEMO_SUGGESTION_ROUND_WON;
  const suggestedAligned = Math.round((debt + alpha) / unit) * unit;
  const floor = Math.max(unit, roundWon(minTotal));
  return {
    alpha,
    suggestedTotal: Math.max(floor, suggestedAligned),
  };
}

export function assertChargeMeetsConversionMinimum(chargeAmount, quote) {
  const amount = roundWon(chargeAmount);
  const minTotal = roundWon(quote?.minTotal);
  if (amount < minTotal) {
    const err = new Error(
      `실사용 전환 입금은 최소 ${minTotal.toLocaleString("ko-KR")}원입니다. (이용분 정산 ${roundWon(quote?.demoDebt).toLocaleString("ko-KR")}원 + 선수금 ${roundWon(quote?.prepaidMin).toLocaleString("ko-KR")}원)`,
    );
    err.statusCode = 400;
    err.code = "CONVERSION_MIN_NOT_MET";
    err.minTotal = minTotal;
    err.quote = quote;
    throw err;
  }
  return true;
}
