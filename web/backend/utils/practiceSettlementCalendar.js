// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/jobs/monthlyPracticeObSettlementWorker.js
// - web/backend/utils/creditLock.util.js
// - web/backend/utils/krHolidays.static.js
//
// 치과 기공료 수기 정산 달력 (KST).
// 1일 09:00 안내 문자, 5일(영업일)까지 1차 입금, 그 날 12:00 미납 재안내,
// 10일(영업일)까지 2차 입금, 그 다음 날 09:00부터 신규 주문 정지.
// 5·10일이 주말·공휴일이면 해당 기한만 다음 영업일로 민다. 1일 문자는 달력 그대로.
// 정지는 자정이 아니다. 전날 입금을 오전에 확인한 뒤 막기 위해 09:00이다.
import { isStaticKrHolidayYmd } from "./krHolidays.static.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

export function settlementYmd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function settlementKstDate(ymd, hh = 0, mm = 0, ss = 0) {
  const [y, m, d] = String(ymd || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return null;
  return new Date(
    `${settlementYmd(y, m, d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}+09:00`,
  );
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function addSettlementDaysYmd(ymd, days) {
  const p = parseYmd(ymd);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + Number(days || 0), 12));
  return settlementYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function isWeekendYmd(ymd) {
  const p = parseYmd(ymd);
  if (!p) return false;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isSettlementNonBusinessYmd(ymd) {
  return isWeekendYmd(ymd) || isStaticKrHolidayYmd(ymd);
}

/** 주말·공휴일이면 다음 영업일. 평일이면 그대로. */
export function rollSettlementBusinessYmd(ymd) {
  let cur = String(ymd || "");
  for (let i = 0; i < 21; i += 1) {
    if (!cur || !isSettlementNonBusinessYmd(cur)) return cur;
    cur = addSettlementDaysYmd(cur, 1);
  }
  return cur;
}

/** 다음 영업일(당일 제외). */
export function nextSettlementBusinessYmd(ymd) {
  return rollSettlementBusinessYmd(addSettlementDaysYmd(ymd, 1));
}

export function kstYmdFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  if (!map.year || !map.month || !map.day) return "";
  return `${map.year}-${map.month}-${map.day}`;
}

function nextMonthOf(yearMonth) {
  const [yStr, mStr] = String(yearMonth || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}

/**
 * 사용월(yearMonth)의 익월 정산 일정.
 * suspendAt = 2차 입금일 다음 날 09:00 KST. 이 시각부터 신규 기공의뢰를 멈춘다.
 */
export function resolvePracticeSettlementCalendar(yearMonth) {
  const nm = nextMonthOf(yearMonth);
  if (!nm) {
    throw new Error("정산 월이 올바르지 않습니다.");
  }
  const { y, m } = nm;
  const noticeYmd = settlementYmd(y, m, 1);
  const firstDueYmd = rollSettlementBusinessYmd(settlementYmd(y, m, 5));
  let secondDueYmd = rollSettlementBusinessYmd(settlementYmd(y, m, 10));
  if (secondDueYmd < firstDueYmd) secondDueYmd = firstDueYmd;
  const suspendYmd = addSettlementDaysYmd(secondDueYmd, 1);
  const labPayoutOnYmd = nextSettlementBusinessYmd(firstDueYmd);
  return {
    noticeYmd,
    noticeAt: settlementKstDate(noticeYmd, 9, 0),
    firstDueYmd,
    reminderAt: settlementKstDate(firstDueYmd, 12, 0),
    secondDueYmd,
    suspendYmd,
    suspendAt: settlementKstDate(suspendYmd, 9, 0),
    labPayoutOnYmd,
  };
}

/**
 * 5일(1차)까지 들어온 돈은 그 다음 영업일(보통 6일)에 기공소로.
 * 그 이후 입금은 확인한 날의 다음 영업일.
 */
export function resolveLabPayoutYmd({
  receivedAt,
  firstDueYmd,
  labPayoutOnYmd,
}) {
  const receivedYmd = kstYmdFromDate(receivedAt);
  if (!receivedYmd) return String(labPayoutOnYmd || "");
  if (firstDueYmd && receivedYmd <= firstDueYmd) {
    return String(labPayoutOnYmd || nextSettlementBusinessYmd(firstDueYmd));
  }
  return nextSettlementBusinessYmd(receivedYmd);
}

export function formatSettlementMonthDay(ymd) {
  const p = parseYmd(ymd);
  if (!p) return "";
  return `${p.m}월 ${p.d}일`;
}
