// related files:
// - web/backend/services/easyFinBankSync.service.js
// - web/backend/tests/unit/easyFinBankSync.test.js
// change-log:
// - 2026-10-14: 팝빌 계좌조회 Search 결과에서 잔액·입금만 고르는 순수 함수.

const KST = "Asia/Seoul";

function kstYmd(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${pick("year")}${pick("month")}${pick("day")}`;
}

function shiftYmd(ymd, days) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}${mm}${dd}`;
}

/** 조회일 KST 기준 전날~오늘. 팝빌 1회 수집 상한(1개월) 안. */
export function easyFinSearchRangeKst(now = new Date()) {
  const eDate = kstYmd(now);
  return { sDate: shiftYmd(eDate, -1), eDate };
}

/** yyyyMMddHHmmss → KST Date. 길이가 짧으면 null. */
export function parsePopbillTrdt(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if (raw.length < 8) return null;
  const ymd = raw.slice(0, 8);
  const hms = raw.slice(8).padEnd(6, "0").slice(0, 6);
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}+09:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function money(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Search 한 건 → 입금 upsert 인자. 출금·0원은 null.
 * 적요는 은행마다 remark 칸이 달라 비어 있지 않은 값을 한 줄로 붙인다.
 */
export function mapEasyFinDeposit(row, account) {
  const accIn = money(row?.accIn ?? row?.AccIn);
  if (accIn <= 0) return null;

  const accountNumber = String(account?.accountNumber || "").replace(/\D/g, "");
  const trdt = String(row?.trdt || row?.trDT || "");
  const serial = String(row?.trserial ?? row?.trSerial ?? "");
  const tid = String(row?.tid || row?.TID || "").trim();
  const externalId = tid || (trdt ? `${accountNumber}:${trdt}:${serial}` : "");
  if (!externalId) return null;

  const remarks = [row?.remark1, row?.remark2, row?.remark3, row?.remark4, row?.memo]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  return {
    externalId,
    bankCode: String(account?.bankCode || ""),
    accountNumber,
    tranAmt: accIn,
    printedContent: [...new Set(remarks)].join(" "),
    occurredAt: parsePopbillTrdt(trdt),
    raw: row,
  };
}

export function readEasyFinBalance(searchResult) {
  const raw = searchResult?.balance ?? searchResult?.Balance;
  if (raw == null || String(raw).trim() === "") return null;
  const n = money(raw);
  return Number.isFinite(n) ? n : null;
}

export function isEasyFinJobDone(state) {
  const jobState = Number(state?.jobState ?? state?.jobstate);
  const errorCode = Number(state?.errorCode ?? state?.errorcode);
  return { jobState, errorCode, done: jobState === 3, ok: jobState === 3 && errorCode === 1 };
}
