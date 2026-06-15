export type ImplantSpecSource = {
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
  connectionDiameter?: number | null;
};

export type ResolvedImplantConnectionSpec = {
  screwType: string;
  connectionDiameter: number | null;
  hexSize: number | null;
  matched: boolean;
};

type ImplantSpecRow = {
  manufacturer: string;
  brands: string[];
  family: "Regular" | "Mini" | "Narrow" | "Small Narrow";
  screwType: string;
  connectionDiameter: number;
  hexSize: number;
};

// SSOT 매핑 테이블(제조사 공정/라벨용):
// - 값은 PRC 파일명 기준의 "원본 브랜드 토큰"을 사용한다.
//   (예: TS, Superline, IS, UF, AnyOne, MiNi, SQ)
// - 의뢰자 화면의 선택값(IS2/IS3/ALX, TS3, Superline2, One-Q 등)은 유지하고,
//   여기에서만 제조사 공정 표시용으로 alias 정규화를 수행한다.
const TABLE_ROWS: ImplantSpecRow[] = [
  {
    manufacturer: "OSSTEM",
    brands: ["TS"],
    family: "Regular",
    screwType: "A",
    connectionDiameter: 3.35,
    hexSize: 2.5,
  },
  {
    manufacturer: "OSSTEM",
    brands: ["TS"],
    family: "Mini",
    screwType: "D",
    connectionDiameter: 2.6,
    hexSize: 2.1,
  },

  {
    manufacturer: "DENTIUM",
    brands: ["Superline", "Implantium"],
    family: "Regular",
    screwType: "B",
    connectionDiameter: 3.33,
    hexSize: 2.5,
  },

  {
    manufacturer: "NEOBIOTECH",
    brands: ["IS", "ALX"],
    family: "Regular",
    screwType: "A",
    connectionDiameter: 3.35,
    hexSize: 2.5,
  },
  {
    manufacturer: "NEOBIOTECH",
    brands: ["IS", "ALX"],
    family: "Small Narrow",
    screwType: "C",
    connectionDiameter: 2.6,
    hexSize: 2.1,
  },

  {
    manufacturer: "DIO",
    brands: ["UF"],
    family: "Regular",
    screwType: "A",
    connectionDiameter: 3.35,
    hexSize: 2.5,
  },
  {
    manufacturer: "DIO",
    brands: ["UF"],
    family: "Narrow",
    screwType: "E",
    connectionDiameter: 2.3,
    hexSize: 1.7,
  },

  {
    manufacturer: "MEGAGEN",
    brands: ["AnyOne"],
    family: "Regular",
    screwType: "A",
    connectionDiameter: 3.3,
    hexSize: 2.5,
  },
  {
    manufacturer: "MEGAGEN",
    brands: ["AnyOne"],
    family: "Mini",
    screwType: "C",
    connectionDiameter: 3.1,
    hexSize: 2.3,
  },
  {
    manufacturer: "MEGAGEN",
    brands: ["MiNi"],
    family: "Mini",
    screwType: "E",
    connectionDiameter: 2.3,
    hexSize: 1.7,
  },

  {
    manufacturer: "DENTIS",
    brands: ["SQ"],
    family: "Regular",
    screwType: "A",
    connectionDiameter: 3.35,
    hexSize: 2.5,
  },
  {
    manufacturer: "DENTIS",
    brands: ["SQ"],
    family: "Mini",
    screwType: "D",
    connectionDiameter: 2.8,
    hexSize: 2.1,
  },
  {
    manufacturer: "DENTIS",
    brands: ["SQ"],
    family: "Narrow",
    screwType: "E",
    connectionDiameter: 2.3,
    hexSize: 1.7,
  },
];

const token = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// 제조사(세척·패킹) 화면/라벨에서만 사용하는 브랜드 정규화.
// PRC 원본 브랜드 토큰으로 통일해 스크류/직경 매핑 누락을 방지한다.
const normalizeBrandByManufacturerToken = (
  manufacturerToken: string,
  brandToken: string,
) => {
  if (!manufacturerToken || !brandToken) return brandToken;

  if (manufacturerToken === "OSSTEM") {
    if (brandToken.startsWith("TS")) return "TS";
  }

  if (manufacturerToken === "DENTIUM") {
    if (brandToken.startsWith("SUPERLINE")) return "SUPERLINE";
    if (brandToken === "IMPLANTIUM") return "IMPLANTIUM";
  }

  if (manufacturerToken === "NEOBIOTECH") {
    if (brandToken.startsWith("IS")) return "IS";
    if (brandToken === "ALX") return "ALX";
  }

  if (manufacturerToken === "DIO") {
    if (brandToken.startsWith("UF")) return "UF";
  }

  if (manufacturerToken === "MEGAGEN") {
    if (brandToken.includes("ANYONE")) return "ANYONE";
    if (brandToken.includes("MINI")) return "MINI";
  }

  if (manufacturerToken === "DENTIS") {
    if (brandToken === "SQ" || brandToken === "ONEQ") return "SQ";
  }

  return brandToken;
};

const normalizeFamily = (value?: string | null) => {
  const t = token(value);
  if (!t) return "";
  if (t === "REGULAR") return "REGULAR";
  if (t === "MINI" || t === "SMALL") return "MINI";
  if (t === "NARROW") return "NARROW";
  if (t === "SMALLNARROW" || t === "SN") return "SMALLNARROW";
  return t;
};

const toFinite = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const resolveImplantConnectionSpec = (
  source?: ImplantSpecSource | null,
): ResolvedImplantConnectionSpec => {
  const manufacturerToken = token(source?.implantManufacturer);
  const brandToken = normalizeBrandByManufacturerToken(
    manufacturerToken,
    token(source?.implantBrand),
  );
  const familyToken = normalizeFamily(source?.implantFamily);

  const row = TABLE_ROWS.find((candidate) => {
    if (token(candidate.manufacturer) !== manufacturerToken) return false;
    if (!candidate.brands.some((b) => token(b) === brandToken)) return false;
    return normalizeFamily(candidate.family) === familyToken;
  });

  if (row) {
    return {
      screwType: row.screwType,
      connectionDiameter: row.connectionDiameter,
      hexSize: row.hexSize,
      matched: true,
    };
  }

  return {
    screwType: "",
    connectionDiameter: toFinite(source?.connectionDiameter),
    hexSize: null,
    matched: false,
  };
};
