// related files:
// - web/backend/services/demoConversion.service.js
// - web/backend/utils/creditChargeUnit.js

export function roundWon(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

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
