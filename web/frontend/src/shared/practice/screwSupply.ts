// related files:
// - web/backend/utils/labPracticeScrewSupply.js
// - web/frontend/src/shared/components/practice/ScrewSupplyField.tsx
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx

/** abuts = 어벗츠 정품, manufacturer = 임플란트 제조사 호환 */
export type ScrewSupply = "abuts" | "manufacturer";

export type LabPracticeScrewSupplyRow = {
  practiceAnchorId: string | null;
  practiceNameKey: string;
  screwSupply: ScrewSupply;
};

export function normalizeScrewSupply(value: unknown): ScrewSupply | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "manufacturer") return "manufacturer";
  if (raw === "abuts") return "abuts";
  return null;
}

export function toPracticeNameKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function findLabPracticeScrewSupply(
  rows: LabPracticeScrewSupplyRow[] | null | undefined,
  input: { practiceAnchorId?: string | null; practiceName?: string | null },
): ScrewSupply | null {
  const list = Array.isArray(rows) ? rows : [];
  const practiceAnchorId = String(input.practiceAnchorId || "").trim();
  if (practiceAnchorId) {
    const byId = list.find((row) => row.practiceAnchorId === practiceAnchorId);
    if (byId) return byId.screwSupply;
  }
  const key = toPracticeNameKey(input.practiceName);
  if (!key) return null;
  const byName = list.find((row) => row.practiceNameKey === key);
  return byName?.screwSupply || null;
}

export function resolveScrewSupply(
  explicit: unknown,
  preference: ScrewSupply | null | undefined,
): ScrewSupply {
  return normalizeScrewSupply(explicit) || preference || "abuts";
}

/** 옵션 라벨. 없으면 「제조사」. 여러 개면 가운데점으로 잇는다. */
export function screwManufacturerLabel(
  names: Array<string | null | undefined>,
): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const name of names) {
    const label = String(name || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  if (!labels.length) return "제조사";
  return labels.join(" · ");
}

export function screwCompatiblePhrase(manufacturerLabel: string): string {
  const name = String(manufacturerLabel || "").trim() || "제조사";
  if (name === "제조사") return "제조사 호환";
  return `${name} 호환`;
}
