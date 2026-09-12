// related files:
// - web/frontend/src/shared/components/practice/PracticeAbutmentShipDateButton.tsx
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/shipping/estimateShipDate.ts
// - web/backend/utils/practiceTransferArrivalDates.js
// change-log:
// - 2026-09-12: 출고일=도착−n 선택(최소 2). 낮 12시 전 신속·이후 묶음 출고일까지.
// - 2026-09-12: 어벗 출고일 기본=치과도착일−3달력일. 출고일−3일 임박 경고 폐기.

import {
  formatKstYmdToKo,
  kstAddCivilDays,
  kstYmdDiffDays,
  toKstYmd,
} from "@/shared/date/kst";
import {
  normalizeWeeklyBatchDays,
  resolveNextWeeklyBatchYmd,
} from "@/shared/shipping/weeklyBatchSchedule";

/** 어벗 출고 기본 = 치과도착일 − N달력일 */
export const PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS = 3;

/** 어벗 출고 = 치과도착일 − n일에서 n 최소 */
export const PRACTICE_ABUTMENT_SHIP_MIN_BEFORE_ARRIVAL_CIVIL_DAYS = 2;

/** 신속/묶음 컷오프(KST). 이전=신속출고일, 이후=묶음출고일. */
export const PRACTICE_ABUTMENT_SHIP_NOON_CUTOFF_HOUR_KST = 12;

export type PracticeAbutmentShipCutoffMode = "express" | "bulk";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function getKstHour(dateInput: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hour12: false,
  }).formatToParts(dateInput);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : dateInput.getHours();
}

function getKstWeekdayFromYmd(ymd: string): number | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function addBusinessDaysFromKstYmd(startYmd: string, days: number): string {
  if (!Number.isFinite(days) || days <= 0) return startYmd;
  const result = new Date(`${startYmd}T12:00:00+09:00`);
  if (Number.isNaN(result.getTime())) return startYmd;
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = getKstWeekdayFromYmd(toKstYmd(result) || startYmd);
    if (day != null && day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return toKstYmd(result) || startYmd;
}

function nextBusinessDayInclusive(startYmd: string): string {
  const day = getKstWeekdayFromYmd(startYmd);
  if (day != null && day !== 0 && day !== 6) return startYmd;
  return addBusinessDaysFromKstYmd(startYmd, 1);
}

export function defaultAbutmentShipYmdFromArrival(
  arrivalYmd?: string | null,
): string | null {
  return kstAddCivilDays(
    arrivalYmd,
    -PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS,
  );
}

export function resolvePracticeTransferArrivalYmd(transfer?: {
  arrivalDate?: string | null;
  arrivalDates?: string[] | null;
} | null): string | null {
  const direct = String(transfer?.arrivalDate || "").trim();
  if (YMD_RE.test(direct)) return direct;
  const list = Array.isArray(transfer?.arrivalDates)
    ? transfer.arrivalDates
        .map((ymd) => String(ymd || "").trim())
        .filter((ymd) => YMD_RE.test(ymd))
    : [];
  return list.length > 0 ? list[list.length - 1]! : null;
}

/** 기공소 설정값 우선, 없으면 치과도착일 − 3달력일 */
export function resolveEffectiveAbutmentShipYmd(transfer?: {
  arrivalDate?: string | null;
  arrivalDates?: string[] | null;
  production?: { abutmentShipYmd?: string | null } | null;
} | null): string | null {
  const stored = String(transfer?.production?.abutmentShipYmd || "").trim();
  if (YMD_RE.test(stored)) return stored;
  return defaultAbutmentShipYmdFromArrival(
    resolvePracticeTransferArrivalYmd(transfer),
  );
}

export function resolveAbutmentShipCutoffMode(
  at: Date = new Date(),
): PracticeAbutmentShipCutoffMode {
  return getKstHour(at) < PRACTICE_ABUTMENT_SHIP_NOON_CUTOFF_HOUR_KST
    ? "express"
    : "bulk";
}

/**
 * 오늘 기준 선택 가능한 가장 이른 어벗 출고일.
 * 낮 12시 전=신속출고일, 이후=묶음출고일(리드 1영업일·주간 묶음일 정렬).
 */
export function resolveEarliestSelectableAbutmentShipYmd(opts?: {
  at?: Date;
  weeklyBatchDays?: unknown;
}): string | null {
  const at = opts?.at ?? new Date();
  const today = toKstYmd(at);
  if (!today) return null;
  const mode = resolveAbutmentShipCutoffMode(at);
  if (mode === "express") {
    return nextBusinessDayInclusive(today);
  }
  const base = addBusinessDaysFromKstYmd(today, 1);
  const batchDays = normalizeWeeklyBatchDays(opts?.weeklyBatchDays);
  if (batchDays.length === 0) return base;
  return resolveNextWeeklyBatchYmd(base, batchDays);
}

/** 출고일 = 치과도착일 − n달력일 */
export function abutmentShipYmdFromArrivalMinusN(
  arrivalYmd?: string | null,
  n?: number | null,
): string | null {
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < PRACTICE_ABUTMENT_SHIP_MIN_BEFORE_ARRIVAL_CIVIL_DAYS
  ) {
    return null;
  }
  return kstAddCivilDays(arrivalYmd, -Math.floor(n));
}

/** 현재 출고일의 n (도착 − 출고). 없거나 비정상이면 null. */
export function resolveAbutmentShipBeforeArrivalN(opts: {
  shipYmd?: string | null;
  arrivalYmd?: string | null;
}): number | null {
  const ship = String(opts.shipYmd || "").trim();
  const arrival = String(opts.arrivalYmd || "").trim();
  if (!YMD_RE.test(ship) || !YMD_RE.test(arrival)) return null;
  const n = kstYmdDiffDays(ship, arrival);
  if (n == null || n < PRACTICE_ABUTMENT_SHIP_MIN_BEFORE_ARRIVAL_CIVIL_DAYS) {
    return null;
  }
  return n;
}

/**
 * n 선택 범위. min=2, max=도착−(신속|묶음 출고일) 달력일 수.
 * max < min 이면 선택 불가(도착이 너무 촉박).
 */
export function resolveAbutmentShipNRange(opts: {
  arrivalYmd?: string | null;
  at?: Date;
  weeklyBatchDays?: unknown;
}): {
  minN: number;
  maxN: number;
  mode: PracticeAbutmentShipCutoffMode;
  earliestShipYmd: string | null;
  selectable: boolean;
} {
  const minN = PRACTICE_ABUTMENT_SHIP_MIN_BEFORE_ARRIVAL_CIVIL_DAYS;
  const at = opts.at ?? new Date();
  const mode = resolveAbutmentShipCutoffMode(at);
  const arrival = String(opts.arrivalYmd || "").trim();
  const earliestShipYmd = resolveEarliestSelectableAbutmentShipYmd({
    at,
    weeklyBatchDays: opts.weeklyBatchDays,
  });
  if (!YMD_RE.test(arrival) || !earliestShipYmd) {
    return { minN, maxN: minN, mode, earliestShipYmd, selectable: false };
  }
  const maxN = kstYmdDiffDays(earliestShipYmd, arrival);
  if (maxN == null || maxN < minN) {
    return {
      minN,
      maxN: minN - 1,
      mode,
      earliestShipYmd,
      selectable: false,
    };
  }
  return { minN, maxN, mode, earliestShipYmd, selectable: true };
}

export function clampAbutmentShipN(
  n: number | null | undefined,
  range: { minN: number; maxN: number; selectable: boolean },
): number | null {
  if (!range.selectable) return null;
  const raw =
    typeof n === "number" && Number.isFinite(n)
      ? Math.floor(n)
      : PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS;
  return Math.min(range.maxN, Math.max(range.minN, raw));
}

export function formatAbutmentShipButtonLabel(shipYmd?: string | null): string {
  const ymd = String(shipYmd || "").trim();
  if (!YMD_RE.test(ymd)) return "어벗 출고일";
  return `출고 ${formatKstYmdToKo(ymd)}`;
}

/** 버튼·팝오버 안내 줄(줄바꿈 SSOT). `whitespace-pre-line`로 표시. */
export function getAbutmentShipNPickerHintLines(opts?: {
  mode?: PracticeAbutmentShipCutoffMode;
}): string[] {
  const mode = opts?.mode ?? resolveAbutmentShipCutoffMode();
  const modeLabel = mode === "express" ? "신속출고일" : "묶음출고일";
  const noonSide = mode === "express" ? "전" : "후";
  return [
    "출고 = 치과도착 − n일 (n ≥ 2)",
    `낮 12시 ${noonSide} → ${modeLabel}까지`,
  ];
}

/** 호버 툴팁용 한 블록 문자열 */
export function getAbutmentShipNPickerTooltip(opts?: {
  mode?: PracticeAbutmentShipCutoffMode;
}): string {
  return getAbutmentShipNPickerHintLines(opts).join("\n");
}
