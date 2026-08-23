// related files:
// - web/backend/utils/labPracticePartnerMemo.js
// - web/frontend/src/shared/components/practice/CounterpartyMemoStrip.tsx

export const LAB_PRACTICE_PARTNER_MEMO_MAX = 500;

export type LabPracticePartnerMemoPublic = {
  memo: string;
  updatedAt?: string | null;
};

export function normalizeLabPracticePartnerMemo(value: unknown): string {
  const memo = String(value ?? "").trim();
  if (!memo) return "";
  return memo.slice(0, LAB_PRACTICE_PARTNER_MEMO_MAX);
}

export function parseLabPracticePartnerMemoPublic(
  raw: unknown,
): LabPracticePartnerMemoPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const memo = normalizeLabPracticePartnerMemo(
    (raw as { memo?: unknown }).memo,
  );
  if (!memo) return null;
  const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
  return {
    memo,
    updatedAt: updatedAt ? String(updatedAt) : null,
  };
}
