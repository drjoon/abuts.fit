// related files:
// - web/backend/models/newConnectionImplantGroup.model.js
// - web/backend/utils/implantCanonical.js
// - web/backend/services/newConnectionRequestDashboard.service.js
import NewConnectionImplantGroup from "../models/newConnectionImplantGroup.model.js";
import { IMPLANT_MANUFACTURER_CATALOG } from "../utils/implantManufacturerCatalog.js";
import {
  normalizeImplantBrand,
  normalizeImplantManufacturer,
} from "../utils/implantCanonical.js";

const text = (value) => String(value || "").trim();

export function normalizeNameToken(raw) {
  return text(raw)
    .normalize("NFC")
    .toUpperCase()
    .replace(/[_\-]+/g, "")
    .replace(/\s+/g, "");
}

export function buildImplantGroupKey(manufacturer, brand) {
  const canonicalManufacturer = normalizeImplantManufacturer(manufacturer);
  const canonicalBrand = normalizeImplantBrand(brand, canonicalManufacturer);
  const mTok = normalizeNameToken(canonicalManufacturer) || "UNKNOWN";
  const bTok = normalizeNameToken(canonicalBrand) || "UNKNOWN";
  return {
    groupKey: `${mTok}__${bTok}`,
    canonicalManufacturer,
    canonicalBrand,
  };
}

export function extractNewConnectionImplantPair(caseInfos) {
  const unsupported = text(caseInfos?.unsupportedConnection?.label);
  if (unsupported) {
    const parts = unsupported.split("/").map((part) => text(part));
    return {
      manufacturer: parts[0] || "",
      brand: parts[1] || "",
      family: parts[2] || "",
      implantType: parts[3] || "",
      source: "unsupported",
    };
  }
  const nsr = caseInfos?.newSystemRequest;
  if (nsr?.requested) {
    return {
      manufacturer: text(nsr.manufacturer),
      brand: text(nsr.brand),
      family: text(nsr.family),
      implantType: "",
      source: "new_implant",
    };
  }
  return {
    manufacturer: text(caseInfos?.implantManufacturer),
    brand: text(caseInfos?.implantBrand),
    family: text(caseInfos?.implantFamily),
    implantType: text(caseInfos?.implantType),
    source: "catalog",
  };
}

function pairTokens(manufacturer, brand) {
  const { canonicalManufacturer, canonicalBrand } = buildImplantGroupKey(
    manufacturer,
    brand,
  );
  return {
    manufacturerToken: normalizeNameToken(canonicalManufacturer),
    brandToken: normalizeNameToken(canonicalBrand),
    canonicalManufacturer,
    canonicalBrand,
  };
}

function aliasMatchesPair(alias, manufacturer, brand) {
  const target = pairTokens(manufacturer, brand);
  const aliasPair = pairTokens(alias?.manufacturer, alias?.brand);
  return (
    aliasPair.manufacturerToken === target.manufacturerToken &&
    aliasPair.brandToken === target.brandToken
  );
}

export function buildGroupLookupMaps(groups) {
  const byKey = new Map();
  const byPairToken = new Map();

  for (const group of groups) {
    byKey.set(group.groupKey, group);
    const canonical = pairTokens(
      group.canonicalManufacturer,
      group.canonicalBrand,
    );
    byPairToken.set(
      `${canonical.manufacturerToken}::${canonical.brandToken}`,
      group.groupKey,
    );
    for (const alias of group.aliases || []) {
      const aliasPair = pairTokens(alias.manufacturer, alias.brand);
      byPairToken.set(
        `${aliasPair.manufacturerToken}::${aliasPair.brandToken}`,
        group.groupKey,
      );
    }
  }

  return { byKey, byPairToken };
}

export async function loadAllNewConnectionImplantGroups() {
  return NewConnectionImplantGroup.find({}).lean();
}

export async function resolveGroupKeyForPair(manufacturer, brand, lookup) {
  const pair = pairTokens(manufacturer, brand);
  const tokenKey = `${pair.manufacturerToken}::${pair.brandToken}`;
  const existingKey = lookup?.byPairToken?.get(tokenKey);
  if (existingKey) return existingKey;

  const built = buildImplantGroupKey(manufacturer, brand);
  if (lookup?.byKey?.has(built.groupKey)) {
    return built.groupKey;
  }
  return built.groupKey;
}

export async function ensureNewConnectionImplantGroup(
  manufacturer,
  brand,
  { lookup } = {},
) {
  const built = buildImplantGroupKey(manufacturer, brand);
  const tokenKey = `${normalizeNameToken(built.canonicalManufacturer)}::${normalizeNameToken(built.canonicalBrand)}`;
  const mappedKey = lookup?.byPairToken?.get(tokenKey);
  if (mappedKey) {
    return lookup.byKey.get(mappedKey) || null;
  }

  let doc = await NewConnectionImplantGroup.findOne({
    groupKey: built.groupKey,
  }).lean();
  if (doc) return doc;

  try {
    doc = await NewConnectionImplantGroup.create({
      groupKey: built.groupKey,
      canonicalManufacturer: built.canonicalManufacturer,
      canonicalBrand: built.canonicalBrand,
      aliases: [],
    });
    return doc.toObject();
  } catch (e) {
    if (e?.code === 11000) {
      return NewConnectionImplantGroup.findOne({
        groupKey: built.groupKey,
      }).lean();
    }
    throw e;
  }
}

export function mapGroupToWorkflowDto(group) {
  if (!group) {
    return {
      groupKey: "",
      canonicalManufacturer: "",
      canonicalBrand: "",
      aliases: [],
      read: false,
      inDevelopment: false,
      developmentComplete: false,
      readAt: null,
      inDevelopmentAt: null,
      developmentCompleteAt: null,
    };
  }
  return {
    groupKey: group.groupKey,
    canonicalManufacturer: text(group.canonicalManufacturer),
    canonicalBrand: text(group.canonicalBrand),
    aliases: Array.isArray(group.aliases)
      ? group.aliases.map((row) => ({
          manufacturer: text(row.manufacturer),
          brand: text(row.brand),
        }))
      : [],
    read: Boolean(group.readAt),
    inDevelopment: Boolean(group.inDevelopmentAt),
    developmentComplete: Boolean(group.developmentCompleteAt),
    readAt: group.readAt || null,
    inDevelopmentAt: group.inDevelopmentAt || null,
    developmentCompleteAt: group.developmentCompleteAt || null,
  };
}

export async function updateGroupWorkflow(groupKey, userId, flags) {
  const key = text(groupKey);
  if (!key) throw new Error("groupKey required");

  const doc = await NewConnectionImplantGroup.findOne({ groupKey: key });
  if (!doc) {
    return null;
  }

  const uid = userId || null;
  const now = new Date();

  if (typeof flags.read === "boolean") {
    doc.readAt = flags.read ? now : null;
    doc.readBy = flags.read ? uid : null;
  }
  if (typeof flags.inDevelopment === "boolean") {
    doc.inDevelopmentAt = flags.inDevelopment ? now : null;
    doc.inDevelopmentBy = flags.inDevelopment ? uid : null;
  }
  if (typeof flags.developmentComplete === "boolean") {
    doc.developmentCompleteAt = flags.developmentComplete ? now : null;
    doc.developmentCompleteBy = flags.developmentComplete ? uid : null;
  }

  await doc.save();
  return doc.toObject();
}

export async function updateGroupCanonical(groupKey, payload) {
  const key = text(groupKey);
  const doc = await NewConnectionImplantGroup.findOne({ groupKey: key });
  if (!doc) return null;

  const nextManufacturer = text(payload?.canonicalManufacturer);
  const nextBrand = text(payload?.canonicalBrand);
  if (nextManufacturer) {
    doc.canonicalManufacturer = normalizeImplantManufacturer(nextManufacturer);
  }
  if (nextBrand) {
    doc.canonicalBrand = normalizeImplantBrand(
      nextBrand,
      doc.canonicalManufacturer,
    );
  }

  const mergeFrom = payload?.mergeAlias;
  if (mergeFrom?.manufacturer && mergeFrom?.brand) {
    const aliases = Array.isArray(doc.aliases) ? [...doc.aliases] : [];
    const exists = aliases.some((row) =>
      aliasMatchesPair(row, mergeFrom.manufacturer, mergeFrom.brand),
    );
    if (!exists) {
      aliases.push({
        manufacturer: text(mergeFrom.manufacturer),
        brand: text(mergeFrom.brand),
      });
      doc.aliases = aliases;
    }
  }

  await doc.save();
  return doc.toObject();
}

export async function mergeNewConnectionImplantGroups(fromGroupKey, toGroupKey) {
  const fromKey = text(fromGroupKey);
  const toKey = text(toGroupKey);
  if (!fromKey || !toKey || fromKey === toKey) {
    return { ok: false, reason: "invalid_keys" };
  }

  const [fromDoc, toDoc] = await Promise.all([
    NewConnectionImplantGroup.findOne({ groupKey: fromKey }),
    NewConnectionImplantGroup.findOne({ groupKey: toKey }),
  ]);
  if (!fromDoc || !toDoc) {
    return { ok: false, reason: "not_found" };
  }

  const aliases = Array.isArray(toDoc.aliases) ? [...toDoc.aliases] : [];
  const pushAlias = (manufacturer, brand) => {
    if (!manufacturer || !brand) return;
    if (aliases.some((row) => aliasMatchesPair(row, manufacturer, brand))) {
      return;
    }
    aliases.push({ manufacturer: text(manufacturer), brand: text(brand) });
  };

  pushAlias(fromDoc.canonicalManufacturer, fromDoc.canonicalBrand);
  for (const row of fromDoc.aliases || []) {
    pushAlias(row.manufacturer, row.brand);
  }
  toDoc.aliases = aliases;

  if (!toDoc.readAt && fromDoc.readAt) {
    toDoc.readAt = fromDoc.readAt;
    toDoc.readBy = fromDoc.readBy;
  }
  if (!toDoc.inDevelopmentAt && fromDoc.inDevelopmentAt) {
    toDoc.inDevelopmentAt = fromDoc.inDevelopmentAt;
    toDoc.inDevelopmentBy = fromDoc.inDevelopmentBy;
  }
  if (!toDoc.developmentCompleteAt && fromDoc.developmentCompleteAt) {
    toDoc.developmentCompleteAt = fromDoc.developmentCompleteAt;
    toDoc.developmentCompleteBy = fromDoc.developmentCompleteBy;
  }

  await Promise.all([toDoc.save(), fromDoc.deleteOne()]);
  return { ok: true, group: toDoc.toObject() };
}

function matchesImplantSuggestQuery(haystack, query) {
  const h = text(haystack).normalize("NFC");
  const q = text(query).normalize("NFC");
  if (!h || !q) return false;
  if (h.toLocaleLowerCase("ko-KR").includes(q.toLocaleLowerCase("ko-KR"))) {
    return true;
  }
  const token = normalizeNameToken(q);
  if (!token) return false;
  return normalizeNameToken(h).includes(token);
}

function collectCatalogManufacturerLabels() {
  const labels = new Set();
  for (const def of Object.values(IMPLANT_MANUFACTURER_CATALOG)) {
    for (const alias of def?.aliases || []) {
      const label = text(alias);
      if (label) labels.add(label);
    }
  }
  return [...labels];
}

export async function suggestImplantNameRegistry({ field, query, manufacturer }) {
  const q = text(query);
  if (!q || q.length < 1) return [];

  const groups = await NewConnectionImplantGroup.find({}).lean();
  const suggestions = new Map();

  const parentCanonical = manufacturer
    ? normalizeImplantManufacturer(manufacturer)
    : "";
  const parentFilter = normalizeNameToken(manufacturer);

  const consider = (manufacturerValue, brandValue) => {
    const m = text(manufacturerValue);
    const b = text(brandValue);
    if (field === "brand") {
      if (parentFilter) {
        const rowCanonical = normalizeImplantManufacturer(m);
        if (
          parentCanonical &&
          rowCanonical &&
          rowCanonical !== parentCanonical &&
          normalizeNameToken(m) !== parentFilter
        ) {
          return;
        }
        if (
          !parentCanonical &&
          normalizeNameToken(m) !== parentFilter &&
          !matchesImplantSuggestQuery(m, manufacturer)
        ) {
          return;
        }
      }
      const target = b;
      if (!target) return;
      if (!matchesImplantSuggestQuery(target, q)) return;
      suggestions.set(`${m}::${b}`, { manufacturer: m, brand: b });
      return;
    }
    const target = m;
    if (!target) return;
    if (!matchesImplantSuggestQuery(target, q)) return;
    suggestions.set(m, { manufacturer: m, brand: "" });
  };

  for (const group of groups) {
    consider(group.canonicalManufacturer, group.canonicalBrand);
    for (const alias of group.aliases || []) {
      consider(alias.manufacturer, alias.brand);
    }
  }

  if (field === "manufacturer") {
    for (const label of collectCatalogManufacturerLabels()) {
      consider(label, "");
    }
  }

  return [...suggestions.values()].slice(0, 12);
}
