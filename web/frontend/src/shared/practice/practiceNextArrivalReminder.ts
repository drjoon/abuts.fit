// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/practice/components/PracticeNextArrivalOverdueNotice.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - 2026-09-07: 다단계(틀니) 도착일에 다음 도착일 미지정 시 깜빡임·헤더 알림.

import { kstYmdDiffDays, toKstYmd } from "@/shared/date/kst";
import {
  nextStageOfPlan,
  normalizeLabRequestStagePlans,
  type PracticeLabRequestStagePlan,
} from "@/shared/practice/requestStagePresets";

/** 도착일 당일(daysPast=0)부터 CTA 깜빡임 */
export type PracticeNextArrivalReminderLevel = "due_today" | "overdue";

export type PracticeNextArrivalReminder = {
  arrivalYmd: string;
  /** 도착일 → 오늘(KST) 경과 일수. 0=당일, 1+=미지정 지연 */
  daysPast: number;
  level: PracticeNextArrivalReminderLevel;
};

const CANCEL_STATUSES = new Set(["취소", "작업취소"]);

export function resolvePracticeCurrentArrivalYmd(opts: {
  arrivalDates?: readonly string[] | null;
  arrivalDate?: string | null;
}): string | null {
  const list = Array.isArray(opts.arrivalDates)
    ? opts.arrivalDates.map((d) => String(d || "").trim()).filter(Boolean)
    : [];
  if (list.length > 0) return list[list.length - 1] || null;
  const single = String(opts.arrivalDate || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(single) ? single : null;
}

/** 아직 진행할 다음 공정이 하나라도 있으면 true */
export function hasPracticeNextProcessStage(
  plans: readonly PracticeLabRequestStagePlan[] | null | undefined,
): boolean {
  return normalizeLabRequestStagePlans(plans).some((plan) =>
    Boolean(nextStageOfPlan(plan)?.name),
  );
}

/**
 * 다단계 의뢰에서 현재 도착일 tip ≤ 오늘이고 다음 공정이 남아 있으면 리마인더.
 * tip이 미래면 이미 다음 도착일을 지정한 상태.
 */
export function resolvePracticeNextArrivalReminder(opts: {
  status?: unknown;
  arrivalDates?: readonly string[] | null;
  arrivalDate?: string | null;
  labRequestStagePlans?: readonly PracticeLabRequestStagePlan[] | null;
  now?: Date;
}): PracticeNextArrivalReminder | null {
  if (CANCEL_STATUSES.has(String(opts.status || "").trim())) return null;
  if (!hasPracticeNextProcessStage(opts.labRequestStagePlans)) return null;

  const arrivalYmd = resolvePracticeCurrentArrivalYmd(opts);
  const todayYmd = toKstYmd(opts.now ?? new Date());
  if (!arrivalYmd || !todayYmd) return null;
  if (arrivalYmd > todayYmd) return null;

  const daysPast = kstYmdDiffDays(arrivalYmd, todayYmd);
  if (daysPast == null || daysPast < 0) return null;

  return {
    arrivalYmd,
    daysPast,
    level: daysPast >= 1 ? "overdue" : "due_today",
  };
}

export function isPracticeNextArrivalAttention(
  reminder: PracticeNextArrivalReminder | null | undefined,
): boolean {
  return Boolean(reminder);
}

export function isPracticeNextArrivalOverdue(
  reminder: PracticeNextArrivalReminder | null | undefined,
): boolean {
  return Boolean(reminder && reminder.daysPast >= 1);
}

export function getPracticeNextArrivalReminderTooltip(
  reminder: PracticeNextArrivalReminder | null | undefined,
): string {
  if (!reminder) {
    return "다음 도착일 선택 시 오늘이 재주문일로 함께 반영됩니다. 오늘 이후 다음 도착일 1개만 두며, 다시 고르면 수정되고 크레딧은 추가 차감되지 않습니다.";
  }
  if (reminder.level === "due_today") {
    return "오늘이 지난 공정 제품의 치과도착일입니다. 다음 공정 진행을 위해 「다음 도착일」을 지정해 주세요.";
  }
  const n = Math.max(1, reminder.daysPast);
  return `치과도착일(${reminder.arrivalYmd})로부터 ${n}일이 지났는데 다음 도착일이 아직 없습니다. 다음 공정 진행을 위해 지정해 주세요.`;
}

export function practiceNextArrivalAttentionClassName(
  attention?: boolean,
): string {
  return attention
    ? "practice-transfer-attention rounded-md border border-transparent"
    : "";
}
