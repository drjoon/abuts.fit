// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js

export const LAB_PRACTICE_PARTNER_MEMO_MAX = 500;

export function normalizeLabPracticePartnerMemo(value) {
  const memo = String(value ?? "").trim();
  if (!memo) return "";
  return memo.slice(0, LAB_PRACTICE_PARTNER_MEMO_MAX);
}

export function findLabPracticePartnerMemo(rows, practiceAnchorId) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId) return null;
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((row) => String(row?.practiceAnchorId || "").trim() === practiceId) ||
    null
  );
}

export function upsertLabPracticePartnerMemoList(
  rows,
  practiceAnchorId,
  memo,
) {
  const practiceId = String(practiceAnchorId || "").trim();
  const normalized = normalizeLabPracticePartnerMemo(memo);
  const list = Array.isArray(rows) ? [...rows] : [];
  const idx = list.findIndex(
    (row) => String(row?.practiceAnchorId || "").trim() === practiceId,
  );
  const now = new Date();
  if (!normalized) {
    if (idx < 0) return list;
    list.splice(idx, 1);
    return list;
  }
  const nextRow = {
    practiceAnchorId: practiceId,
    memo: normalized,
    updatedAt: now,
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...nextRow };
    return list;
  }
  list.push(nextRow);
  return list;
}

export function toLabPracticePartnerMemoPublicApi(row) {
  if (!row || typeof row !== "object") return null;
  const memo = normalizeLabPracticePartnerMemo(row.memo);
  if (!memo) return null;
  return {
    memo,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}
