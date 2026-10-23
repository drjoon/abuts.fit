// related files:
// - web/backend/utils/labPracticeScrewSupply.js
// - web/frontend/src/shared/components/practice/ScrewSupplyField.tsx
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// - web/frontend/src/utils/implantConnectionSpec.ts
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";

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

/** 세척.패킹 로트. 어벗츠 정품은 A–E, 제조사 호환은 1–6. */
export const ABUTS_PACKING_SCREW_TYPES = ["A", "B", "C", "D", "E"] as const;

/** 번호 순서는 로트 키와 툴팁이 같이 쓴다. */
export const FIXTURE_MANUFACTURER_SCREW_ROWS = [
  { number: "1", name: "DENTIUM" },
  { number: "2", name: "OSSTEM" },
  { number: "3", name: "MEGAGEN" },
  { number: "4", name: "NEOBIOTECH" },
  { number: "5", name: "DIO" },
  { number: "6", name: "DENTIS" },
] as const;

export const FIXTURE_MANUFACTURER_SCREW_TYPES: readonly string[] =
  FIXTURE_MANUFACTURER_SCREW_ROWS.map((row) => row.number);

export const DEFAULT_PACKING_SCREW_TYPES: readonly string[] = [
  ...ABUTS_PACKING_SCREW_TYPES,
  ...FIXTURE_MANUFACTURER_SCREW_TYPES,
];

const FIXTURE_MANUFACTURER_ALIASES: Record<string, (typeof FIXTURE_MANUFACTURER_SCREW_ROWS)[number]["name"]> =
  {
    OSSTEM: "OSSTEM",
    오스템: "OSSTEM",
    DENTIUM: "DENTIUM",
    덴티움: "DENTIUM",
    NEOBIOTECH: "NEOBIOTECH",
    NEO: "NEOBIOTECH",
    네오: "NEOBIOTECH",
    네오바이오텍: "NEOBIOTECH",
    DIO: "DIO",
    디오: "DIO",
    MEGAGEN: "MEGAGEN",
    메가젠: "MEGAGEN",
    DENTIS: "DENTIS",
    덴티스: "DENTIS",
  };

const FIXTURE_NAME_TO_NUMBER = Object.fromEntries(
  FIXTURE_MANUFACTURER_SCREW_ROWS.map((row) => [row.name, row.number]),
) as Record<string, string>;

export function canonicalFixtureManufacturerName(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  return FIXTURE_MANUFACTURER_ALIASES[compact] || FIXTURE_MANUFACTURER_ALIASES[raw] || "";
}

/** 로트·표시 키. 제조사 풀네임은 번호로 바꾼다. 그 외 문자열은 대문자 그대로. */
export function toPackingScrewTypeKey(value: unknown): string {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "-") return "";
  if ((ABUTS_PACKING_SCREW_TYPES as readonly string[]).includes(raw)) return raw;
  if ((FIXTURE_MANUFACTURER_SCREW_TYPES as readonly string[]).includes(raw)) return raw;
  const name = canonicalFixtureManufacturerName(raw);
  if (name && FIXTURE_NAME_TO_NUMBER[name]) return FIXTURE_NAME_TO_NUMBER[name];
  return raw;
}

export function manufacturerScrewHoverNumber(value: unknown): string {
  const key = toPackingScrewTypeKey(value);
  if ((FIXTURE_MANUFACTURER_SCREW_TYPES as readonly string[]).includes(key)) return key;
  return "";
}

export type CaseScrewTypeInput = {
  screwSupply?: unknown;
  implantManufacturer?: unknown;
  implantBrand?: unknown;
  implantFamily?: unknown;
  implantType?: unknown;
  connectionDiameter?: unknown;
  connectionScrewType?: unknown;
};

/** 표시·로트 키. 어벗츠면 A–E, 제조사 호환이면 1–6. */
export function resolveCaseScrewType(input: CaseScrewTypeInput): string {
  const supply = normalizeScrewSupply(input.screwSupply) || "abuts";
  if (supply === "manufacturer") {
    return manufacturerScrewHoverNumber(input.implantManufacturer);
  }
  const explicit = String(input.connectionScrewType || "")
    .trim()
    .toUpperCase();
  if ((ABUTS_PACKING_SCREW_TYPES as readonly string[]).includes(explicit)) {
    return explicit;
  }
  const diameter = Number(input.connectionDiameter);
  const spec = resolveImplantConnectionSpec({
    implantManufacturer: String(input.implantManufacturer || ""),
    implantBrand: String(input.implantBrand || ""),
    implantFamily: String(input.implantFamily || ""),
    implantType: String(input.implantType || ""),
    connectionDiameter: Number.isFinite(diameter) ? diameter : null,
  });
  const letter = String(spec.screwType || "")
    .trim()
    .toUpperCase();
  if ((ABUTS_PACKING_SCREW_TYPES as readonly string[]).includes(letter)) {
    return letter;
  }
  return "";
}

export function screwTypeOptionLabel(type: unknown): string {
  const value = toPackingScrewTypeKey(type);
  if (!value) return "";
  return `스크류 ${value}`;
}

export function ensureCanonicalScrewLotItems<T extends { type: string; lotNumber: string }>(
  items: T[],
): T[] {
  const byType = new Map<string, T>();
  for (const row of items) {
    const type = toPackingScrewTypeKey(row?.type);
    if (!type) continue;
    const prev = byType.get(type);
    const lotNumber = String(row?.lotNumber || "");
    const storedAsNumber = FIXTURE_MANUFACTURER_SCREW_TYPES.includes(
      String(row?.type || "")
        .trim()
        .toUpperCase(),
    );
    if (!prev) {
      byType.set(type, { ...row, type, lotNumber });
      continue;
    }
    if (storedAsNumber && lotNumber) prev.lotNumber = lotNumber;
    else if (!prev.lotNumber && lotNumber) prev.lotNumber = lotNumber;
  }
  const ordered: T[] = [];
  for (const type of DEFAULT_PACKING_SCREW_TYPES) {
    ordered.push(byType.get(type) || ({ type, lotNumber: "" } as T));
    byType.delete(type);
  }
  for (const row of byType.values()) ordered.push(row);
  return ordered;
}

export function screwCompatiblePhrase(manufacturerLabel: string): string {
  const name = String(manufacturerLabel || "").trim() || "제조사";
  if (name === "제조사") return "제조사 호환";
  return `${name} 호환`;
}

/** 의뢰자 스크류 선택 — 필드·라디오 라벨 SSOT */
export const SCREW_SUPPLY_FIELD_LABEL = "스크류 선택";

export const SCREW_SUPPLY_ABUTS_OPTION_LABEL = "어벗츠 정품";

export const SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_1 = "준비 중입니다.";
export const SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_2 = "11월 중 제공 예정입니다.";
