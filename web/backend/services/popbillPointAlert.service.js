// related files:
// - web/backend/services/payoutAccountVerify.service.js
// - web/backend/controllers/admin/admin.popbillPoint.controller.js
// - web/frontend/src/pages/admin/dashboard/AdminPopbillPointCard.tsx
// change-log:
// - 2026-10-13: 팝빌 파트너 포인트 부족 감지 기록(계좌 확인 건너뜀 → 관리자 대시보드 노출).

/** @type {{ at: Date, count: number, message: string } | null} */
let shortage = null;

export function isPopbillPointShortage(msg) {
  return /잔여\s*포인트|포인트가?\s*부족/.test(String(msg || ""));
}

export function recordPopbillPointShortage(message = "") {
  shortage = {
    at: new Date(),
    count: (shortage?.count || 0) + 1,
    message: String(message || ""),
  };
}

export function clearPopbillPointShortage() {
  shortage = null;
}

export function getPopbillPointShortage() {
  return shortage;
}
