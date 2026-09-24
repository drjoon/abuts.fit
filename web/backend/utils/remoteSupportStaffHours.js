// related files:
// - web/backend/controllers/remoteSupport/remoteSupport.controller.js
// - web/backend/utils/krBusinessDays.js
// - web/frontend/src/features/remoteSupport/remoteSupportStaffHours.ts
import {
  getTodayYmdInKst,
  isKoreanBusinessDay,
} from "./krBusinessDays.js";

const KST_TZ = "Asia/Seoul";

/** 치과·기공소 원격 지원 요청: KST 평일 10:00–18:00 (법정 공휴일 제외) */
export const REMOTE_SUPPORT_STAFF_HOURS = {
  startHour: 10,
  endHour: 18,
};

export const REMOTE_SUPPORT_STAFF_HOURS_MESSAGE =
  "원격 지원 요청은 평일 오전 10시부터 오후 6시까지 가능합니다. 법정 공휴일은 제외됩니다.";

function getKstHour(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (!Number.isFinite(hour)) return null;
  return hour === 24 ? 0 : hour;
}

/**
 * 치과·기공소(staff) 원격 지원 요청 가능 여부.
 * 관리자 초대(invite)에는 적용하지 않는다.
 */
export async function isRemoteSupportStaffRequestOpen(date = new Date()) {
  const ymd = getTodayYmdInKst(date);
  if (!ymd) return false;
  if (!(await isKoreanBusinessDay(ymd))) return false;
  const hour = getKstHour(date);
  if (hour == null) return false;
  return (
    hour >= REMOTE_SUPPORT_STAFF_HOURS.startHour &&
    hour < REMOTE_SUPPORT_STAFF_HOURS.endHour
  );
}
