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
    const manufacturer = part(row.displayManufacturer) || part(row.manufacturer);
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

/** 의뢰 사양과 가장 많이 맞는 라이브러리. 제조사가 다르면 고르지 않는다. */
export function matchImplantLibrary(
  libraries: readonly ImplantLibrary[],
  spec: LabProsthesisAiImplantSpec | null,
): ImplantLibrary | null {
  if (!spec || !spec.manufacturer) return null;
  const want = {
    manufacturer: key(spec.manufacturer),
    brand: key(spec.brand),
    family: key(spec.family),
    type: key(spec.type),
  };
  let best: ImplantLibrary | null = null;
  let bestScore = 0;
  for (const row of libraries) {
    if (key(row.manufacturer) !== want.manufacturer) continue;
    let score = 1;
    if (want.brand && key(row.brand) === want.brand) score += 4;
    if (want.family && key(row.family) === want.family) score += 2;
    if (want.type && key(row.type) === want.type) score += 1;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
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
