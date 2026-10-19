// 예약 수량(machiningQty)이 남아 있으면 완료 직후 같은 의뢰를 다시 가공 큐에 넣는다.
// actualMachiningComplete가 있으면 이번 수량 묶음은 끝난 상태라 재투입하지 않는다.

export function shouldRequeueSameRequestAfterComplete(productionSchedule) {
  const qty = Number(productionSchedule?.machiningQty);
  if (!Number.isFinite(qty) || qty < 1) return false;
  if (productionSchedule?.actualMachiningComplete) return false;
  return true;
}
