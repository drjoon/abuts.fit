// 기공소 AI 보철 — 임플란트 라이브러리. 어벗 카탈로그(/api/implant-presets)를 제조사 → 시스템으로 묶는다.
// related files:
// - web/frontend/src/shared/practice/useImplantConnectionCatalog.ts
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import type { LabProsthesisAiImplantSpec } from "@/shared/practice/labProsthesisAiDesign";
import type { ScanbodyShape } from "@/shared/practice/labProsthesisModify";

export type ImplantLibrary = {
  id: string;
  manufacturer: string;
  /** 시스템(브랜드). 없으면 빈 문자열. */
  brand: string;
  family: string;
  type: string;
  label: string;
  connectionDiameterMm: number | null;
  screwType: string;
};

const FAVORITE_STORAGE = "abuts.labProsthesis.implantLibraryFavorites";

function part(value: unknown) {
  return String(value || "").trim();
}

function key(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

export function implantLibraryId(row: {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
}) {
  return [row.manufacturer, row.brand, row.family, row.type].map(key).join("|");
}

export function buildImplantLibraries(
  connections: readonly ImplantConnection[],
): ImplantLibrary[] {
  const out = new Map<string, ImplantLibrary>();
  for (const row of connections) {
    // 대소문자만 다른 표기(Megagen·MEGAGEN)는 대문자 하나로 모은다.
    const manufacturer = (part(row.manufacturer) || part(row.displayManufacturer)).toUpperCase();
    if (!manufacturer) continue;
    const brand = part(row.displayBrand) || part(row.brand);
    const family = part(row.displayFamily) || part(row.family);
    const type = part(row.displayType) || part(row.type);
    const id = implantLibraryId({ manufacturer, brand, family, type });
    if (out.has(id)) continue;
    const diameter = Number(row.connectionDiameter ?? row.diameter);
    out.set(id, {
      id,
      manufacturer,
      brand,
      family,
      type,
      label: [brand || manufacturer, family, type].filter(Boolean).join(" "),
      connectionDiameterMm: Number.isFinite(diameter) && diameter > 0 ? diameter : null,
      screwType: part(row.screwType),
    });
  }
  return [...out.values()].sort(
    (a, b) =>
      a.manufacturer.localeCompare(b.manufacturer) || a.label.localeCompare(b.label),
  );
}

function sameField(orderValue: string, libraryValue: string) {
  const want = key(orderValue);
  const have = key(libraryValue);
  if (!want) return true;
  if (want === have) return true;
  // 의뢰가 Hex이고 카탈로그가 HEX 2.5처럼 뒤에 규격이 붙으면 같은 항목으로 본다.
  return have === want || have.startsWith(`${want} `);
}

/** 의뢰에 적힌 항목이 라이브러리와 같은지. 비어 있는 의뢰 항목은 비교하지 않는다. */
export function implantLibraryFollowsOrder(
  library: Pick<ImplantLibrary, "manufacturer" | "brand" | "family" | "type">,
  spec: LabProsthesisAiImplantSpec | null,
): boolean {
  if (!spec?.manufacturer) return false;
  if (key(library.manufacturer) !== key(spec.manufacturer)) return false;
  if (!sameField(spec.brand, library.brand)) return false;
  if (!sameField(spec.family, library.family)) return false;
  if (!sameField(spec.type, library.type)) return false;
  return true;
}

/** 의뢰 사양과 적힌 항목이 모두 맞는 라이브러리. 여럿이거나 없으면 고르지 않는다. */
export function matchImplantLibrary(
  libraries: readonly ImplantLibrary[],
  spec: LabProsthesisAiImplantSpec | null,
): ImplantLibrary | null {
  if (!spec?.manufacturer) return null;
  const hits = libraries.filter((row) => implantLibraryFollowsOrder(row, spec));
  return hits.length === 1 ? hits[0] : null;
}

/** 스캔바디는 연결부보다 조금 굵은 원기둥으로 본다. 연결부를 모르면 표준 4.8mm. */
export function scanbodyShapeOf(library: ImplantLibrary | null): ScanbodyShape {
  const connection = library?.connectionDiameterMm ?? null;
  const diameter = connection ? Math.min(6, Math.max(3.6, connection + 1.2)) : 4.8;
  return { radiusMm: diameter / 2, heightMm: 10 };
}

export function readImplantFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITE_STORAGE);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.map((row) => String(row)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function writeImplantFavorites(ids: readonly string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITE_STORAGE, JSON.stringify([...new Set(ids)]));
  } catch {
    /* 즐겨찾기는 이 탭에서만 유지한다. */
  }
}
