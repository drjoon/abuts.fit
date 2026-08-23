// change-log:
// - 2026-08-23: PeriodFilter API from/to — KST YMD·ISO 공통 파싱 SSOT.
// related files:
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/credits/creditLedgerStats.controller.js
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/store/usePeriodStore.ts

/**
 * @param {string} raw
 * @param {"start"|"end"} bound
 * @returns {Date|null}
 */
export function parseKstQueryBoundDate(raw, bound) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return bound === "start"
      ? new Date(`${s}T00:00:00+09:00`)
      : new Date(`${s}T23:59:59.999+09:00`);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 장부·집계 API query.from / query.to / query.period → occurredAt 범위.
 * @param {Record<string, unknown>} query
 * @param {{ parsePreset?: (period: string) => Date|null }} options
 */
export function buildOccurredAtFromPeriodQuery(query = {}, options = {}) {
  const occurredAt = {};
  const periodRaw = String(query.period || "").trim();
  const parsePreset = options.parsePreset;
  if (parsePreset) {
    const sinceFromPeriod = parsePreset(periodRaw);
    if (sinceFromPeriod) occurredAt.$gte = sinceFromPeriod;
  }

  const fromRaw = String(query.from || query.fromYmd || "").trim();
  const toRaw = String(query.to || query.toYmd || "").trim();

  const from = parseKstQueryBoundDate(fromRaw, "start");
  if (from) occurredAt.$gte = from;
  const to = parseKstQueryBoundDate(toRaw, "end");
  if (to) occurredAt.$lte = to;

  return occurredAt;
}
