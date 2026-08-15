// related files:
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/practice/practiceRecentTransferList.ts
// - web/frontend/src/shared/components/practice/PracticeAcceptOverdueBadge.tsx
// - 2026-08-15: 주문 후 1영업일 지나도 미수락이면 목록에 「수락대기」표시.

import { kstYmdDiffBusinessDays, toKstYmd } from "@/shared/date/kst";

/** 미수락 경고 기준(영업일). 주문일 다음날부터 센다(같은 날=0). */
export const PRACTICE_ACCEPT_OVERDUE_BUSINESS_DAYS = 1;

export const PRACTICE_ACCEPT_OVERDUE_LABEL = "수락대기";

export const PRACTICE_ACCEPT_OVERDUE_BADGE_CLASS =
  "border-accent/80 bg-accent-soft text-accent-strong hover:bg-accent-soft";

export const PRACTICE_ACCEPT_OVERDUE_TOOLTIP_PRACTICE =
  "주문 후 1영업일이 지났는데 기공소 수락이 없습니다.";

export const PRACTICE_ACCEPT_OVERDUE_TOOLTIP_LAB =
  "주문 후 1영업일이 지났는데 아직 수락하지 않은 의뢰입니다.";

export type PracticeAcceptOverdueViewer = "practice" | "lab";

export function getPracticeAcceptOverdueTooltip(
  viewer: PracticeAcceptOverdueViewer = "practice",
): string {
  return viewer === "lab"
    ? PRACTICE_ACCEPT_OVERDUE_TOOLTIP_LAB
    : PRACTICE_ACCEPT_OVERDUE_TOOLTIP_PRACTICE;
}

/** 「의뢰」버킷 — 아직 기공소 수락 전 */
export function isPracticeTransferPendingAccept(status: unknown): boolean {
  const s = String(status || "").trim();
  return s === "발송완료" || s === "수신완료" || s === "자동매칭";
}

/** 주문일(YYYY-MM-DD) 우선, 없으면 createdAt → KST YMD */
export function resolvePracticeOrderYmd(opts: {
  orderDate?: string | null;
  createdAt?: string | number | Date | null;
  createdAtTs?: number | null;
}): string | null {
  const order = String(opts.orderDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(order)) return order;
  if (
    opts.createdAtTs != null &&
    Number.isFinite(opts.createdAtTs) &&
    Number(opts.createdAtTs) > 0
  ) {
    return toKstYmd(Number(opts.createdAtTs));
  }
  return toKstYmd(opts.createdAt ?? null);
}

/** 미수락 상태로 주문일 기준 1영업일 이상 경과 */
export function isPracticeTransferAcceptOverdue(opts: {
  status: unknown;
  orderDate?: string | null;
  createdAt?: string | number | Date | null;
  createdAtTs?: number | null;
  now?: Date;
}): boolean {
  if (!isPracticeTransferPendingAccept(opts.status)) return false;
  const fromYmd = resolvePracticeOrderYmd(opts);
  const toYmd = toKstYmd(opts.now ?? new Date());
  const days = kstYmdDiffBusinessDays(fromYmd, toYmd);
  return (
    typeof days === "number" &&
    Number.isFinite(days) &&
    days >= PRACTICE_ACCEPT_OVERDUE_BUSINESS_DAYS
  );
}
