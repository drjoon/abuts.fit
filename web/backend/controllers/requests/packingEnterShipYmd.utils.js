// change-log:
// - 2026-08-07: 포장.발송 진입 시 출고일 불변(의뢰 시점 약속일 고정). 당일 끌어올리기/14시 밀기 제거.
// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/requests/shippingOnTime.utils.js

/**
 * 포장.발송 진입 시 timeline 출고일 — 의뢰 시점 약속일을 유지한다.
 * 빈 필드만 채우고, 날짜를 당일/다음 영업일로 바꾸지 않는다.
 */
export function resolvePackingEnterShipYmds({ timeline = {}, todayYmd }) {
  const today = String(todayYmd || "").trim();
  const estimated =
    typeof timeline.estimatedShipYmd === "string" &&
    timeline.estimatedShipYmd.trim()
      ? timeline.estimatedShipYmd.trim()
      : "";
  const next =
    typeof timeline.nextEstimatedShipYmd === "string" &&
    timeline.nextEstimatedShipYmd.trim()
      ? timeline.nextEstimatedShipYmd.trim()
      : "";
  const original =
    typeof timeline.originalEstimatedShipYmd === "string" &&
    timeline.originalEstimatedShipYmd.trim()
      ? timeline.originalEstimatedShipYmd.trim()
      : "";

  const originalEstimatedShipYmd = original || estimated || next || today;
  const estimatedShipYmd =
    estimated || next || originalEstimatedShipYmd || today;
  const nextEstimatedShipYmd =
    next || estimated || originalEstimatedShipYmd || today;

  return {
    originalEstimatedShipYmd,
    nextEstimatedShipYmd,
    estimatedShipYmd,
  };
}
