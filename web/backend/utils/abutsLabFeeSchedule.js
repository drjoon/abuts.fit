// related files:
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js
// - web/backend/controllers/admin/admin.abutsLabFeeSchedule.controller.js
//
// 어벗츠 기공수가(플랫폼 카탈로그) SSOT.
// 자동매칭 예산 모달·기본 ±20%의 기준 항목/단가.

import SystemSettings from "../models/systemSettings.model.js";
import {
  buildDefaultLabFeeSchedule,
  normalizeLabFeeItem,
  normalizeLabFeeItems,
} from "./labFeeSchedule.js";

const MAX_ITEMS = 40;

/** 자동매칭·어벗츠 수가 카탈로그에 넣지 않는 기공소 어벗 항목 */
const EXCLUDED_CATALOG_IDS = new Set([
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
]);

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
    out.push({
      id,
      name: item.name,
      unit: item.unit,
      enabled: item.enabled !== false,
      price: item.price,
      remake: 0,
      tiers: item.tiers,
    });
  }
  return out.length ? out : buildDefaultAbutsLabFeeItems();
}

export function normalizeAbutsLabFeeSchedule(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    items: normalizeAbutsLabFeeItems(src.items),
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
  return normalizeAbutsLabFeeSchedule(doc?.abutsLabFeeSchedule);
}

/** 자동매칭 예산 UI용 — enabled 항목만 */
export function listEnabledAbutsLabFeeCatalogItems(schedule) {
  const items = normalizeAbutsLabFeeSchedule(schedule).items;
  return items.filter((item) => item.enabled !== false && item.name);
}
