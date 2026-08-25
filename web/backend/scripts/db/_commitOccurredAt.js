// related files:
// - web/backend/scripts/db/migrate-request-spend-to-gl.js
// - web/backend/scripts/db/rebalance-commit-occurred-at-from-request.js
// change-log:
// - 2026-08-24: REQUEST/SHIPPING COMMIT occurredAt SSOT.
//   updatedAt 금지 — 이후 집하·롤백·백필이 갱신하면 다른 날 우편함 건이 같은 정산일에 섞인다.

function asValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 제조사 생산 COMMIT 시각.
 * 가공 완료 → 시작 → 의뢰 생성. request.updatedAt은 쓰지 않는다.
 */
export function pickRequestCommitOccurredAt(req) {
  if (!req) return null;
  const ps = req.productionSchedule || {};
  const candidates = [
    ps.actualMachiningComplete,
    ps.actualMachiningStart,
    ps.actualCamComplete,
    req.createdAt,
  ];
  for (const c of candidates) {
    const d = asValidDate(c);
    if (d) return d;
  }
  return null;
}

/**
 * 제조사 배송비 COMMIT 시각.
 * 포장.발송 진입 → 패키지 생성 → 의뢰 생성. package.updatedAt은 쓰지 않는다.
 */
export function pickShippingCommitOccurredAt(pkg, req) {
  const packingReview = req?.caseInfos?.reviewByStage?.packing;
  const ps = req?.productionSchedule || {};
  const candidates = [
    packingReview?.updatedAt,
    pkg?.createdAt,
    ps.actualBatchProcessing,
    req?.createdAt,
  ];
  for (const c of candidates) {
    const d = asValidDate(c);
    if (d) return d;
  }
  return null;
}
