// related files:
// - web/backend/scripts/db/data/connections.seed.js
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// change-log:
// - 2026-08-26: AnyOne Internal Mini 제거 — D3.5도 Regular( RH PRC ).
// - 2026-08-21: CNC 임플란트 표(첨1) SSOT. Dentium Implantium=SuperLine과 동일 패밀리.
/**
 * 치과 커스텀어벗 설정 — CNC 임플란트 선택 표.
 * connections API와 병합해 드롭다운에 쓴다(DB 미반영·누락 대비).
 */
export type CncImplantSpec = {
  manufacturer: string;
  brand: string;
  family: string;
  type?: string;
  displayManufacturer?: string;
  displayBrand?: string;
  displayFamily?: string;
};

/** 첨1 표 + Dentium Implantium(SuperLine과 동일 Regular) */
export const CNC_IMPLANT_CATALOG: ReadonlyArray<CncImplantSpec> = [
  { manufacturer: "OSSTEM", brand: "TS3", family: "Regular", type: "Hex", displayManufacturer: "Osstem" },
  { manufacturer: "OSSTEM", brand: "TS3", family: "Mini", type: "Hex", displayManufacturer: "Osstem" },
  {
    manufacturer: "DENTIUM",
    brand: "Superline2",
    family: "Regular",
    type: "Hex",
    displayManufacturer: "Dentium",
    displayBrand: "SuperLine",
  },
  {
    manufacturer: "DENTIUM",
    brand: "Implantium",
    family: "Regular",
    type: "Hex",
    displayManufacturer: "Dentium",
    displayBrand: "Implantium",
  },
  { manufacturer: "NEOBIOTECH", brand: "IS2", family: "Regular", type: "Hex", displayManufacturer: "NeoBiotech" },
  { manufacturer: "NEOBIOTECH", brand: "IS3", family: "Regular", type: "Hex", displayManufacturer: "NeoBiotech" },
  { manufacturer: "NEOBIOTECH", brand: "ALX", family: "Regular", type: "Hex", displayManufacturer: "NeoBiotech" },
  { manufacturer: "NEOBIOTECH", brand: "IS2", family: "Small Narrow", type: "Hex", displayManufacturer: "NeoBiotech" },
  { manufacturer: "NEOBIOTECH", brand: "IS3", family: "Small Narrow", type: "Hex", displayManufacturer: "NeoBiotech" },
  { manufacturer: "NEOBIOTECH", brand: "ALX", family: "Small Narrow", type: "Hex", displayManufacturer: "NeoBiotech" },
  { manufacturer: "DIO", brand: "UF", family: "Regular", type: "Hex", displayManufacturer: "Dio" },
  { manufacturer: "DIO", brand: "UF", family: "Narrow", type: "Hex", displayManufacturer: "Dio" },
  {
    manufacturer: "MEGAGEN",
    brand: "AnyOne Internal",
    family: "Regular",
    type: "Hex",
    displayManufacturer: "Megagen",
    displayBrand: "AnyOne",
    displayFamily: "Regular (Ø3.5 이상)",
  },
  {
    manufacturer: "MEGAGEN",
    brand: "MiNi Internal",
    family: "Mini",
    type: "Hex",
    displayManufacturer: "Megagen",
    displayBrand: "Mini internal",
  },
  { manufacturer: "DENTIS", brand: "SQ", family: "Regular", type: "Hex", displayManufacturer: "Dentis" },
  { manufacturer: "DENTIS", brand: "SQ", family: "Mini", type: "Hex", displayManufacturer: "Dentis" },
  { manufacturer: "DENTIS", brand: "SQ", family: "Narrow", type: "Hex", displayManufacturer: "Dentis" },
  { manufacturer: "DENTIS", brand: "One-Q", family: "Regular", type: "Hex", displayManufacturer: "Dentis" },
  { manufacturer: "DENTIS", brand: "One-Q", family: "Mini", type: "Hex", displayManufacturer: "Dentis" },
  { manufacturer: "DENTIS", brand: "One-Q", family: "Narrow", type: "Hex", displayManufacturer: "Dentis" },
];

const catalogKey = (row: {
  manufacturer: string;
  brand: string;
  family: string;
  type?: string;
}) =>
  [row.manufacturer, row.brand, row.family, row.type || ""]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");

/** connections API 행과 첨1 표를 합친 CNC 스펙(중복 제거, 표 우선 표시명). */
export const mergeCncImplantSpecs = <
  T extends {
    manufacturer: string;
    brand?: string;
    family?: string;
    type?: string;
    displayManufacturer?: string | null;
    displayBrand?: string | null;
    displayFamily?: string | null;
  },
>(
  connections: T[],
): Array<{
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
  displayManufacturer: string;
  displayBrand: string;
  displayFamily: string;
}> => {
  const out: Array<{
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
    displayManufacturer: string;
    displayBrand: string;
    displayFamily: string;
  }> = [];
  const seen = new Set<string>();

  const push = (row: {
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
    displayManufacturer?: string;
    displayBrand?: string;
    displayFamily?: string;
  }) => {
    const manufacturer = String(row.manufacturer || "").trim();
    const brand = String(row.brand || "").trim();
    const family = String(row.family || "").trim();
    const type = String(row.type || "Hex").trim() || "Hex";
    if (!manufacturer || !brand) return;
    const key = catalogKey({ manufacturer, brand, family, type });
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      manufacturer,
      brand,
      family,
      type,
      displayManufacturer: row.displayManufacturer || manufacturer,
      displayBrand: row.displayBrand || brand,
      displayFamily: row.displayFamily || family,
    });
  };

  for (const row of CNC_IMPLANT_CATALOG) {
    push({
      manufacturer: row.manufacturer,
      brand: row.brand,
      family: row.family,
      type: row.type || "Hex",
      displayManufacturer: row.displayManufacturer,
      displayBrand: row.displayBrand,
      displayFamily: row.displayFamily,
    });
  }
  for (const row of connections) {
    push({
      manufacturer: row.manufacturer,
      brand: String(row.brand || "").trim(),
      family: String(row.family || "").trim(),
      type: String(row.type || "Hex").trim() || "Hex",
      displayManufacturer: row.displayManufacturer || undefined,
      displayBrand: row.displayBrand || undefined,
      displayFamily: row.displayFamily || undefined,
    });
  }
  return out;
};
