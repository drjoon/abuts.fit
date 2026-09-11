/**
 * 기공의뢰수신 미처리(작업큐)·「의뢰」뱃지 순회 우선순위 SSOT.
 *
 * 1. 치과도착일까지 3일 이내(포함)로 남은 건(이미 지난 건 포함)
 * 2. 1이 아니면 커스텀어벗 디자인이 필요한 건
 * 3. 그 외는 치과도착일이 적게 남은 순
 *
 * related files:
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
 * - web/frontend/src/shared/date/kst.ts
 * change-log:
 * - 2026-09-11: 1순위 = 도착 3일 이내(포함). 미처리·의뢰 뱃지 순회.
 * - 2026-09-11: 미처리 작업큐·의뢰 뱃지 클릭 순 우선순위.
 */
import {
  kstYmdDiffDays,
  toKstYmd,
  toKstYmdLoose,
} from "@/shared/date/kst";

/** 우선 1순위 — 오늘 기준 치과도착일까지 남은 일수가 이 값 이하(포함) */
export const LAB_RECEIVE_PENDING_ARRIVAL_URGENT_DAYS = 3;

/** alert에 번호로 노출하는 미처리 상위 건수 */
export const LAB_RECEIVE_PENDING_WORK_ALERT_VISIBLE = 4;

export type LabReceivePendingWorkPriorityInput = {
  arrivalDate?: unknown;
  hasCustomAbutment?: boolean;
  createdAtTs?: unknown;
  createdAt?: unknown;
};

/** 오늘(KST) → 치과도착일 남은 일수. 없으면 null. */
export function resolveLabReceiveArrivalDaysRemaining(
  arrivalDate: unknown,
  now: Date = new Date(),
): number | null {
  const todayYmd = toKstYmd(now);
  const arrivalYmd =
    toKstYmdLoose(arrivalDate) ||
    (arrivalDate != null ? toKstYmd(arrivalDate as string | number | Date) : null);
  if (!todayYmd || !arrivalYmd) return null;
  return kstYmdDiffDays(todayYmd, arrivalYmd);
}

/** 1 · 2 · 3순위 티어 */
export function labReceivePendingWorkPriorityTier(
  input: LabReceivePendingWorkPriorityInput,
  now: Date = new Date(),
): 1 | 2 | 3 {
  const days = resolveLabReceiveArrivalDaysRemaining(input.arrivalDate, now);
  if (
    days != null &&
    days <= LAB_RECEIVE_PENDING_ARRIVAL_URGENT_DAYS
  ) {
    return 1;
  }
  if (Boolean(input.hasCustomAbutment)) return 2;
  return 3;
}

const createdAtMs = (input: LabReceivePendingWorkPriorityInput) => {
  const fromTs = Number(input.createdAtTs);
  if (Number.isFinite(fromTs) && fromTs > 0) return fromTs;
  const fromDate = new Date(String(input.createdAt || "")).getTime();
  return Number.isFinite(fromDate) ? fromDate : 0;
};

/**
 * 미처리 우선순위 비교 (오름차순 = 먼저 보여줄 건이 앞).
 * 동일 티어에서는 남은 일수 적은 순 → createdAt 이른 순.
 */
export function compareLabReceivePendingWorkPriority(
  a: LabReceivePendingWorkPriorityInput,
  b: LabReceivePendingWorkPriorityInput,
  now: Date = new Date(),
): number {
  const tierA = labReceivePendingWorkPriorityTier(a, now);
  const tierB = labReceivePendingWorkPriorityTier(b, now);
  if (tierA !== tierB) return tierA - tierB;

  const daysA = resolveLabReceiveArrivalDaysRemaining(a.arrivalDate, now);
  const daysB = resolveLabReceiveArrivalDaysRemaining(b.arrivalDate, now);
  const da = daysA == null ? Number.POSITIVE_INFINITY : daysA;
  const db = daysB == null ? Number.POSITIVE_INFINITY : daysB;
  if (da !== db) return da - db;

  return createdAtMs(a) - createdAtMs(b);
}

export function sortLabReceivePendingWorkPriority<
  T extends LabReceivePendingWorkPriorityInput,
>(transfers: readonly T[], now: Date = new Date()): T[] {
  return [...transfers].sort((a, b) =>
    compareLabReceivePendingWorkPriority(a, b, now),
  );
}
