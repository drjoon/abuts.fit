import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRC_CONNECTION_DIR = path.resolve(
  __dirname,
  "../../..",
  "bg/esprit-addin/AcroDent/2_Connection",
);

const MANUFACTURER_CANONICAL_OVERRIDES = {
  오스템: "OSSTEM",
  덴티움: "DENTIUM",
  디오: "DIO",
  메가젠: "MEGAGEN",
  네오: "NEOBIOTECH",
  덴티스: "DENTIS",
};

const MANUFACTURER_EXTRA_ALIASES = {
  NEOBIOTECH: ["NEO"],
};

function normalizeToken(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    return s.normalize("NFC");
  } catch {
    return s;
  }
}

function loadManufacturerCatalogFromConnectionDir() {
  const catalog = {};

  try {
    const entries = fs.readdirSync(PRC_CONNECTION_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileName = String(entry.name || "").trim();
      const match = /^(.+?)_([^_]+?)_[A-Z]{2}_Connection\.prc$/i.exec(fileName);
      if (!match) continue;

      const manufacturerKor = normalizeToken(match[1]);
      if (!manufacturerKor) continue;

      const canonical =
        MANUFACTURER_CANONICAL_OVERRIDES[manufacturerKor] ||
        normalizeToken(manufacturerKor).toUpperCase().replace(/\s+/g, "");

      const aliases = new Set([
        canonical,
        manufacturerKor,
        ...(MANUFACTURER_EXTRA_ALIASES[canonical] || []),
      ]);

      const existing = catalog[canonical]?.aliases || [];
      existing.forEach((alias) => aliases.add(alias));

      catalog[canonical] = {
        aliases: Array.from(aliases),
      };
    }
  } catch {
    for (const [manufacturerKor, canonical] of Object.entries(
      MANUFACTURER_CANONICAL_OVERRIDES,
    )) {
      catalog[canonical] = {
        aliases: [
          canonical,
          manufacturerKor,
          ...(MANUFACTURER_EXTRA_ALIASES[canonical] || []),
        ],
      };
    }
  }

  return catalog;
}

export const IMPLANT_MANUFACTURER_CATALOG =
  loadManufacturerCatalogFromConnectionDir();
