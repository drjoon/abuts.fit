// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/models/businessAnchor.model.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeSettingsPage.tsx
// - 2026-08-25: 기공소별 주문→치과도착 기본 일수(달력일).

export const DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS = 7;
export const MAX_LAB_ARRIVAL_DEFAULTS = 80;

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export type PracticeLabArrivalDefault = {
  labAnchorId: string;
  labName: string;
  arrivalDefaultDays: number;
  updatedAt?: string | null;
};

export const normalizeArrivalDefaultDays = (value: unknown) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS;
  return Math.min(365, Math.max(0, Math.floor(raw)));
};

export const normalizeLabArrivalDefaults = (
  items: unknown,
): PracticeLabArrivalDefault[] => {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map<string, PracticeLabArrivalDefault>();

  for (const raw of list) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const labAnchorId = String(row.labAnchorId || "").trim();
    if (!OBJECT_ID_RE.test(labAnchorId)) continue;
    const updatedAtRaw = row.updatedAt ? new Date(String(row.updatedAt)) : null;
    byId.set(labAnchorId, {
      labAnchorId,
      labName: String(row.labName || "").trim().slice(0, 120),
      arrivalDefaultDays: normalizeArrivalDefaultDays(row.arrivalDefaultDays),
      updatedAt:
        updatedAtRaw && !Number.isNaN(updatedAtRaw.getTime())
          ? updatedAtRaw.toISOString()
          : null,
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    })
    .slice(0, MAX_LAB_ARRIVAL_DEFAULTS);
};

/** 기공소별 값 → 없으면 계정 기본(arrivalDefaultDays). */
export const resolveLabArrivalDefaultDays = (
  labAnchorId: string | null | undefined,
  labArrivalDefaults: PracticeLabArrivalDefault[] | null | undefined,
  accountArrivalDefaultDays: number = DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
): number => {
  const id = String(labAnchorId || "").trim();
  const fallback = normalizeArrivalDefaultDays(accountArrivalDefaultDays);
  if (!OBJECT_ID_RE.test(id)) return fallback;
  const hit = (labArrivalDefaults || []).find(
    (row) => String(row.labAnchorId || "").trim() === id,
  );
  if (!hit) return fallback;
  return normalizeArrivalDefaultDays(hit.arrivalDefaultDays);
};

export const upsertLabArrivalDefault = (
  items: PracticeLabArrivalDefault[] | null | undefined,
  patch: {
    labAnchorId: string;
    labName?: string | null;
    arrivalDefaultDays: number;
  },
): PracticeLabArrivalDefault[] => {
  const labAnchorId = String(patch.labAnchorId || "").trim();
  if (!OBJECT_ID_RE.test(labAnchorId)) {
    return normalizeLabArrivalDefaults(items);
  }
  const nextRow: PracticeLabArrivalDefault = {
    labAnchorId,
    labName: String(patch.labName || "").trim().slice(0, 120),
    arrivalDefaultDays: normalizeArrivalDefaultDays(patch.arrivalDefaultDays),
    updatedAt: new Date().toISOString(),
  };
  const without = (items || []).filter(
    (row) => String(row.labAnchorId || "").trim() !== labAnchorId,
  );
  return normalizeLabArrivalDefaults([nextRow, ...without]);
};
