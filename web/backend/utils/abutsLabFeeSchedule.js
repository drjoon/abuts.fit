// related files:
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/backend/controllers/admin/admin.abutsLabFeeSchedule.controller.js
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
//
// 어벗츠 기공수가(플랫폼 카탈로그) SSOT.
// 자동매칭 예산 모달·기본 ±10%의 기준 항목/단가.
// 기공소가 신규 항목을 추가하면 off(pendingReview)로 동기화 후 관리자 검증.

import SystemSettings from "../models/systemSettings.model.js";
import {
  buildDefaultLabFeeSchedule,
  canonicalizeFeeItemName,
  normalizeLabFeeItem,
  normalizeLabFeeItems,
} from "./labFeeSchedule.js";

const MAX_ITEMS = 40;

/** 자동매칭·어벗츠 수가 카탈로그에 넣지 않는 기공소 어벗 항목 */
const EXCLUDED_CATALOG_IDS = new Set([
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
]);

const newCatalogItemId = () =>
  `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readPendingMeta(src) {
  const pendingReview = src?.pendingReview === true;
  const proposedByLabName = String(src?.proposedByLabName || "").trim();
  const proposedByLabAnchorId = String(src?.proposedByLabAnchorId || "").trim();
  const proposedAtRaw = src?.proposedAt;
  const proposedAt =
    proposedAtRaw instanceof Date
      ? proposedAtRaw.toISOString()
      : typeof proposedAtRaw === "string" && proposedAtRaw.trim()
        ? proposedAtRaw.trim()
        : null;
  return {
    pendingReview,
    proposedByLabName,
    proposedByLabAnchorId,
    proposedAt,
  };
}

export function buildDefaultAbutsLabFeeItems() {
  const items = normalizeLabFeeItems(buildDefaultLabFeeSchedule());
  return items
    .filter((item) => item?.name && !EXCLUDED_CATALOG_IDS.has(String(item.id)))
    .map((item, index) =>
      normalizeLabFeeItem(
        {
          ...item,
          remake: 0,
        },
        index,
      ),
    );
}

export function normalizeAbutsLabFeeItems(rawItems) {
  const list = Array.isArray(rawItems) ? rawItems : [];
  const out = [];
  const seen = new Set();
  for (const row of list) {
    if (out.length >= MAX_ITEMS) break;
    const item = normalizeLabFeeItem(row, out.length);
    if (!item.name) continue;
    if (EXCLUDED_CATALOG_IDS.has(item.id)) continue;
    let id = item.id;
    if (!id || seen.has(id)) id = `item-${out.length + 1}`;
    seen.add(id);
    const enabled = item.enabled !== false;
    const meta = readPendingMeta(row);
    // 적용(On)하면 검토 대기 해제. Off로 남은 신규만 pending 유지.
    const pendingReview = enabled ? false : meta.pendingReview;
    out.push({
      id,
      name: item.name,
      unit: item.unit,
      enabled,
      price: item.price,
      remake: 0,
      tiers: item.tiers,
      ...(pendingReview
        ? {
            pendingReview: true,
            ...(meta.proposedByLabName
              ? { proposedByLabName: meta.proposedByLabName }
              : {}),
            ...(meta.proposedByLabAnchorId
              ? { proposedByLabAnchorId: meta.proposedByLabAnchorId }
              : {}),
            ...(meta.proposedAt ? { proposedAt: meta.proposedAt } : {}),
          }
        : {}),
    });
  }
  return out.length ? out : buildDefaultAbutsLabFeeItems();
}

export function normalizeAbutsLabFeeSchedule(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const items = normalizeAbutsLabFeeItems(src.items);
  return {
    items,
    pendingCount: items.filter((item) => item.pendingReview === true).length,
    updatedAt: src.updatedAt || null,
  };
}

export async function loadAbutsLabFeeSchedule() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ abutsLabFeeSchedule: 1 })
    .lean();
  const hasStored =
    Array.isArray(doc?.abutsLabFeeSchedule?.items) &&
    doc.abutsLabFeeSchedule.items.length > 0;
  if (!hasStored) {
    return {
      items: buildDefaultAbutsLabFeeItems(),
      pendingCount: 0,
      updatedAt: null,
    };
  }
  return normalizeAbutsLabFeeSchedule(doc.abutsLabFeeSchedule);
}

export async function saveAbutsLabFeeSchedule(rawItems) {
  const items = normalizeAbutsLabFeeItems(rawItems);
  const updatedAt = new Date();
  const doc = await SystemSettings.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        abutsLabFeeSchedule: {
          items,
          updatedAt,
        },
      },
    },
    { upsert: true, new: true },
  )
    .select({ abutsLabFeeSchedule: 1 })
    .lean();
  try {
    const { default: cache, CacheKeys } = await import("./cache.utils.js");
    cache.delete(CacheKeys.abutsLabFeeCatalog());
  } catch {
    // ignore cache miss wiring
  }
  return normalizeAbutsLabFeeSchedule(doc?.abutsLabFeeSchedule);
}

/** 자동매칭 예산 UI용 — enabled 항목만 */
export function listEnabledAbutsLabFeeCatalogItems(schedule) {
  const items = normalizeAbutsLabFeeSchedule(schedule).items;
  return items.filter((item) => item.enabled !== false && item.name);
}

/**
 * 기공소 수가에만 있고 어벗츠 카탈로그에 없는 이름을 pending(off) 항목으로 만든다.
 * (순수 함수 — DB 미사용, 단위 테스트용)
 */
export function buildPendingAbutsItemsFromLabFees({
  catalogItems,
  labItems,
  labName = "",
  labAnchorId = "",
  proposedAt = null,
} = {}) {
  const catalog = Array.isArray(catalogItems) ? catalogItems : [];
  const existingNames = new Set(
    catalog
      .map((item) => canonicalizeFeeItemName(item?.name))
      .filter(Boolean),
  );
  const proposedByLabName = String(labName || "").trim();
  const proposedByLabAnchorId = String(labAnchorId || "").trim();
  const at =
    proposedAt instanceof Date
      ? proposedAt.toISOString()
      : typeof proposedAt === "string" && proposedAt.trim()
        ? proposedAt.trim()
        : new Date().toISOString();

  const added = [];
  const labList = Array.isArray(labItems) ? labItems : [];
  for (const row of labList) {
    if (catalog.length + added.length >= MAX_ITEMS) break;
    const item = normalizeLabFeeItem(row, added.length);
    if (!item.name) continue;
    if (EXCLUDED_CATALOG_IDS.has(String(item.id || ""))) continue;
    if (existingNames.has(item.name)) continue;
    existingNames.add(item.name);
    added.push({
      id: newCatalogItemId(),
      name: item.name,
      unit: item.unit,
      enabled: false,
      price: item.price,
      remake: 0,
      tiers: (item.tiers || []).map((tier) => ({ ...tier, remake: 0 })),
      pendingReview: true,
      ...(proposedByLabName ? { proposedByLabName } : {}),
      ...(proposedByLabAnchorId ? { proposedByLabAnchorId } : {}),
      proposedAt: at,
    });
  }
  return added;
}

/**
 * 기공소 기공비 저장 시 카탈로그에 없는 신규 이름을 off로 추가.
 * @returns {{ added: object[], schedule: object }}
 */
export async function syncNewLabFeeItemsToAbutsCatalog({
  labItems,
  labName = "",
  labAnchorId = "",
} = {}) {
  const current = await loadAbutsLabFeeSchedule();
  const added = buildPendingAbutsItemsFromLabFees({
    catalogItems: current.items,
    labItems,
    labName,
    labAnchorId,
  });
  if (!added.length) {
    return { added: [], schedule: current };
  }
  const schedule = await saveAbutsLabFeeSchedule([
    ...current.items,
    ...added,
  ]);
  return { added, schedule };
}
