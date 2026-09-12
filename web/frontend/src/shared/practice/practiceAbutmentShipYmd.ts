// related files:
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/date/kst.ts
// - web/backend/utils/practiceTransferArrivalDates.js
// change-log:
// - 2026-09-12: 어벗 출고일 기본=치과도착일−3달력일. 출고일−3일부터 경고(임박/경과).

import { formatKstYmdToKo, kstAddCivilDays, toKstYmd } from "@/shared/date/kst";

/** 어벗 출고 기본 = 치과도착일 − N달력일 */
export const PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS = 3;

/** 출고일 N달력일 전부터 임박 경고 */
export const PRACTICE_ABUTMENT_SHIP_WARN_BEFORE_CIVIL_DAYS = 3;

export type PracticeAbutmentShipWarnLevel = "approaching" | "past";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * 출고일 − 3일부터 임박, 출고일(포함) 이후 경과.
 */
export function resolveAbutmentShipWarnLevel(opts: {
  shipYmd?: string | null;
  todayYmd?: string | null;
}): PracticeAbutmentShipWarnLevel | null {
  const ship = String(opts.shipYmd || "").trim();
  const today = String(opts.todayYmd || toKstYmd(new Date()) || "").trim();
  if (!YMD_RE.test(ship) || !YMD_RE.test(today)) return null;
  if (today >= ship) return "past";
  const warnFrom = kstAddCivilDays(
    ship,
    -PRACTICE_ABUTMENT_SHIP_WARN_BEFORE_CIVIL_DAYS,
  );
  if (warnFrom && today >= warnFrom) return "approaching";
  return null;
}

export function getAbutmentShipWarnLabel(
  level: PracticeAbutmentShipWarnLevel,
): string {
  return level === "past" ? "출고일 경과" : "출고 임박";
}

export function getAbutmentShipWarnMessage(
  level: PracticeAbutmentShipWarnLevel,
  shipYmd?: string | null,
): string {
  const label = shipYmd ? formatKstYmdToKo(shipYmd) : "출고일";
  if (level === "past") {
    return `어벗 출고일(${label})이 지났습니다. 출고일을 확인하거나 어벗 STL을 서둘러 업로드해 주세요.`;
  }
  return `어벗 출고일(${label})이 다가옵니다. 출고 3일 전부터 일정을 확인해 주세요.`;
}

export function formatAbutmentShipButtonLabel(shipYmd?: string | null): string {
  const ymd = String(shipYmd || "").trim();
  if (!YMD_RE.test(ymd)) return "어벗 출고일";
  return `출고 ${formatKstYmdToKo(ymd)}`;
}
