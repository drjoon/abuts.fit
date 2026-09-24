// related files:
// - web/backend/utils/remoteSupportStaffHours.js
// - web/frontend/src/features/remoteSupport/RemoteSupportProvider.tsx
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/date/krHolidays.ts
import { getKstHour, kstYmdWeekday, toKstYmd } from "@/shared/date/kst";
import { isKrPublicHolidayYmd } from "@/shared/date/krHolidays";

/** 치과·기공소 원격 지원 요청: KST 평일 10:00–18:00 (법정 공휴일 제외) */
export const REMOTE_SUPPORT_STAFF_HOURS = {
  startHour: 10,
  endHour: 18,
} as const;

export const REMOTE_SUPPORT_STAFF_HOURS_MESSAGE =
  "원격 지원 요청은 평일 오전 10시부터 오후 6시까지 가능합니다. 법정 공휴일은 제외됩니다.";

function isKstBusinessDayNow(at: Date = new Date()): boolean {
  const ymd = toKstYmd(at);
  if (!ymd) return false;
  const dow = kstYmdWeekday(ymd);
  if (dow == null || dow === 0 || dow === 6) return false;
  return !isKrPublicHolidayYmd(ymd);
}

/** FE 프리체크(정적 공휴일). 최종 판정은 BE Nager 캐시가 SSOT. */
export function isRemoteSupportStaffRequestOpen(at: Date = new Date()): boolean {
  if (!isKstBusinessDayNow(at)) return false;
  const hour = getKstHour(at);
  return (
    hour >= REMOTE_SUPPORT_STAFF_HOURS.startHour &&
    hour < REMOTE_SUPPORT_STAFF_HOURS.endHour
  );
}
