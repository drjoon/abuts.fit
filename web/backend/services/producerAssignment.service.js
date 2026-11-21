// related files:
// - web/backend/models/implantBrandProducerMatch.model.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/creation.request.controller.js
// - web/backend/services/practiceTransferProduction.service.js
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import ImplantBrandProducerMatch from "../models/implantBrandProducerMatch.model.js";
import {
  getCanonicalImplantSpecKey,
  getCanonicalManufacturerBrandKey,
  implantSpecMatchKeys,
  listImplantBrandRows,
  normalizeImplantFields,
} from "../utils/implantCanonical.js";

/**
 * @param {{
 *   defaultAnchorId?: string | null,
 *   alternateAnchorId?: string | null,
 *   platformAnchorId?: string | null,
 *   byId: Map<string, { operatingStatus?: string, approved?: boolean }>,
 * }} input
 */
export function chooseProducerAnchorId({
  defaultAnchorId = null,
  alternateAnchorId = null,
  platformAnchorId = null,
  byId,
}) {
  const usable = (id) => {
    const key = String(id || "").trim();
    if (!key) return false;
    const row = byId.get(key);
    if (!row) return false;
    if (row.operatingStatus === "paused") return false;
    if (!row.approved) return false;
    return true;
  };
  if (usable(defaultAnchorId)) return String(defaultAnchorId);
  if (usable(alternateAnchorId)) return String(alternateAnchorId);
  const platform = String(platformAnchorId || "").trim();
  return platform || null;
}

export function isSelfProducerControl(value) {
  return String(value || "").trim() === "self";
}

function matchHasProducer(row) {
  return Boolean(
    row?.defaultManufacturerAnchorId || row?.alternateManufacturerAnchorId,
  );
}

/** 패밀리 행이 있으면 그 매칭. 없으면 예전 브랜드 단위 매칭. */
export function pickProducerMatch(storedByKey, manufacturer, brand, family) {
  const specKey = getCanonicalImplantSpecKey(manufacturer, brand, family);
  const legacyKey = getCanonicalManufacturerBrandKey(manufacturer, brand);
  if (specKey && storedByKey.has(specKey)) return storedByKey.get(specKey);
  if (legacyKey && storedByKey.has(legacyKey)) return storedByKey.get(legacyKey);
  return null;
}

export async function listOrderableImplantBrandKeys() {
  const [catalog, stored] = await Promise.all([
    Promise.resolve(listImplantBrandRows()),
    ImplantBrandProducerMatch.find({})
      .select({
        brandKey: 1,
        defaultManufacturerAnchorId: 1,
        alternateManufacturerAnchorId: 1,
      })
      .lean(),
  ]);
  const byKey = new Map(stored.map((row) => [row.brandKey, row]));
  const keys = new Set();
  for (const row of catalog) {
    const match = pickProducerMatch(
      byKey,
      row.implantManufacturer,
      row.implantBrand,
      row.implantFamily,
    );
    if (!matchHasProducer(match)) continue;
    for (const key of implantSpecMatchKeys(
      row.implantManufacturer,
      row.implantBrand,
      row.implantFamily,
    )) {
      keys.add(key);
    }
  }
  return [...keys];
}

export async function findStoredProducerMatch(manufacturer, brand, family) {
  const specKey = getCanonicalImplantSpecKey(manufacturer, brand, family);
  const legacyKey = getCanonicalManufacturerBrandKey(manufacturer, brand);
  const keys = [...new Set([specKey, legacyKey].filter(Boolean))];
  if (!keys.length) return null;
  const rows = await ImplantBrandProducerMatch.find({ brandKey: { $in: keys } })
    .select({
      brandKey: 1,
      defaultManufacturerAnchorId: 1,
      alternateManufacturerAnchorId: 1,
    })
    .lean();
  const byKey = new Map(rows.map((row) => [row.brandKey, row]));
  return pickProducerMatch(byKey, manufacturer, brand, family);
}

export async function assertImplantProducerMatchedOrThrow(caseInfos) {
  const normalized = normalizeImplantFields(caseInfos || {});
  const manufacturer = String(normalized.implantManufacturer || "").trim();
  const brand = String(normalized.implantBrand || "").trim();
  const family = String(normalized.implantFamily || "").trim();
  if (!manufacturer || !brand || !family) return;
  const match = await findStoredProducerMatch(manufacturer, brand, family);
  if (!matchHasProducer(match)) {
    const error = new Error("매칭된 제조사가 없는 임플란트는 의뢰할 수 없습니다.");
    error.statusCode = 400;
    throw error;
  }
}

async function findPlatformAnchor() {
  const explicit = await BusinessAnchor.findOne({
    businessType: "manufacturer",
    productionControl: "platform",
  })
    .select({ _id: 1, productionControl: 1, operatingStatus: 1 })
    .lean();
  if (explicit?._id) return explicit;
  return BusinessAnchor.findOne({
    businessType: "manufacturer",
    name: /애크로덴트|acrodent/i,
  })
    .select({ _id: 1, productionControl: 1, operatingStatus: 1 })
    .lean();
}

async function approvedByAnchor(anchorIds) {
  const ids = anchorIds.filter((id) => Types.ObjectId.isValid(String(id || "")));
  if (!ids.length) return new Map();
  const users = await User.find({
    role: "manufacturer",
    businessAnchorId: { $in: ids },
    active: true,
    approvedAt: { $ne: null },
    deletedAt: null,
  })
    .select({ _id: 1, businessAnchorId: 1, subRole: 1, createdAt: 1 })
    .lean();
  const byAnchor = new Map();
  for (const user of users) {
    const key = String(user.businessAnchorId || "");
    const list = byAnchor.get(key) || [];
    list.push(user);
    byAnchor.set(key, list);
  }
  return byAnchor;
}

function pickOwnerUserId(users) {
  if (!users?.length) return null;
  const owner = users.find((user) => user.subRole === "owner") || users[0];
  return owner?._id ? String(owner._id) : null;
}

/**
 * 브랜드 기본 제조사 → 가동 중이면 그 제조사, 아니면 대체, 아니면 플랫폼 제조사.
 * @returns {Promise<{ userId: string | null, anchorId: string | null, producerControl: "platform" | "self" }>}
 */
export async function resolveProducerForCaseInfos(caseInfos) {
  const normalized = normalizeImplantFields(caseInfos || {});
  const platform = await findPlatformAnchor();
  const platformAnchorId = platform?._id ? String(platform._id) : null;
  const match = await findStoredProducerMatch(
    normalized.implantManufacturer,
    normalized.implantBrand,
    normalized.implantFamily,
  );
  const defaultAnchorId = match?.defaultManufacturerAnchorId
    ? String(match.defaultManufacturerAnchorId)
    : null;
  const alternateAnchorId = match?.alternateManufacturerAnchorId
    ? String(match.alternateManufacturerAnchorId)
    : null;
  const anchorIds = [defaultAnchorId, alternateAnchorId, platformAnchorId].filter(
    Boolean,
  );
  const anchors = anchorIds.length
    ? await BusinessAnchor.find({ _id: { $in: anchorIds } })
        .select({ _id: 1, productionControl: 1, operatingStatus: 1 })
        .lean()
    : [];
  const usersByAnchor = await approvedByAnchor(anchorIds);
  const byId = new Map();
  for (const anchor of anchors) {
    const id = String(anchor._id);
    byId.set(id, {
      operatingStatus: anchor.operatingStatus === "paused" ? "paused" : "running",
      approved: usersByAnchor.has(id),
      productionControl: anchor.productionControl === "self" ? "self" : "platform",
    });
  }
  if (platformAnchorId && !byId.has(platformAnchorId)) {
    byId.set(platformAnchorId, {
      operatingStatus: "running",
      approved: usersByAnchor.has(platformAnchorId),
      productionControl: "platform",
    });
  }
  const anchorId = chooseProducerAnchorId({
    defaultAnchorId,
    alternateAnchorId,
    platformAnchorId,
    byId,
  });
  if (!anchorId) {
    return { userId: null, anchorId: null, producerControl: "platform" };
  }
  const chosen = byId.get(anchorId);
  return {
    userId: pickOwnerUserId(usersByAnchor.get(anchorId)),
    anchorId,
    producerControl: chosen?.productionControl === "self" ? "self" : "platform",
  };
}

async function producerControlForUser(userId) {
  if (!userId || !Types.ObjectId.isValid(String(userId))) return "platform";
  const user = await User.findById(userId).select({ businessAnchorId: 1 }).lean();
  if (!user?.businessAnchorId) return "platform";
  const anchor = await BusinessAnchor.findById(user.businessAnchorId)
    .select({ productionControl: 1 })
    .lean();
  return anchor?.productionControl === "self" ? "self" : "platform";
}

export async function assignProducerFields(target, caseInfos) {
  if (!target) return target;
  if (target.caManufacturer) {
    target.producerControl = await producerControlForUser(target.caManufacturer);
    return target;
  }
  const resolved = await resolveProducerForCaseInfos(caseInfos);
  if (resolved.userId && Types.ObjectId.isValid(resolved.userId)) {
    target.caManufacturer = resolved.userId;
    target.producerControl = resolved.producerControl;
  }
  return target;
}
