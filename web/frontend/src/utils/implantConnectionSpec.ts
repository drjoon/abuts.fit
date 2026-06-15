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

// DB seed(web/backend/scripts/db/data/connections.seed.js)와 동일 SSOT 값
const TABLE_ROWS: ImplantSpecRow[] = [
  { manufacturer: "OSSTEM", brands: ["TS3"], family: "Regular", screwType: "A", connectionDiameter: 3.35, hexSize: 2.5 },
  { manufacturer: "OSSTEM", brands: ["TS3"], family: "Mini", screwType: "D", connectionDiameter: 2.6, hexSize: 2.1 },

  { manufacturer: "DENTIUM", brands: ["Superline2", "Implantium"], family: "Regular", screwType: "B", connectionDiameter: 3.33, hexSize: 2.5 },

  { manufacturer: "NEOBIOTECH", brands: ["IS2", "IS3", "ALX"], family: "Regular", screwType: "A", connectionDiameter: 3.35, hexSize: 2.5 },
  { manufacturer: "NEOBIOTECH", brands: ["IS2", "IS3", "ALX"], family: "Small Narrow", screwType: "C", connectionDiameter: 2.6, hexSize: 2.1 },

  { manufacturer: "DIO", brands: ["UF"], family: "Regular", screwType: "A", connectionDiameter: 3.35, hexSize: 2.5 },
  { manufacturer: "DIO", brands: ["UF"], family: "Narrow", screwType: "E", connectionDiameter: 2.3, hexSize: 1.7 },

  { manufacturer: "MEGAGEN", brands: ["AnyOne Internal"], family: "Regular", screwType: "A", connectionDiameter: 3.3, hexSize: 2.5 },
  { manufacturer: "MEGAGEN", brands: ["AnyOne Internal"], family: "Mini", screwType: "C", connectionDiameter: 3.1, hexSize: 2.3 },
  { manufacturer: "MEGAGEN", brands: ["MiNi Internal"], family: "Mini", screwType: "E", connectionDiameter: 2.3, hexSize: 1.7 },

  { manufacturer: "DENTIS", brands: ["SQ", "One-Q"], family: "Regular", screwType: "A", connectionDiameter: 3.35, hexSize: 2.5 },
  { manufacturer: "DENTIS", brands: ["SQ", "One-Q"], family: "Mini", screwType: "D", connectionDiameter: 2.8, hexSize: 2.1 },
  { manufacturer: "DENTIS", brands: ["SQ", "One-Q"], family: "Narrow", screwType: "E", connectionDiameter: 2.3, hexSize: 1.7 },
];

const token = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

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
  const brandToken = token(source?.implantBrand);
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
