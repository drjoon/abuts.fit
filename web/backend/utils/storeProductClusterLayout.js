// change-log:
// - 2026-09-13: 관리자 스토어 클러스터 레이아웃 로드/저장·검증.
// related files:
// - web/backend/models/storeProductClusterLayout.model.js
// - web/backend/constants/storeProductClusters.js
// - web/backend/constants/storeCatalog.js
import StoreProductClusterLayout from "../models/storeProductClusterLayout.model.js";
import { listStoreProductIds } from "../constants/storeCatalog.js";
import { cloneDefaultStoreProductClusters } from "../constants/storeProductClusters.js";

const LAYOUT_KEY = "default";

/** 레거시 단일 kit-case → 3종 옵션 SKU. */
function migrateLegacyKitCaseInClusters(clusters) {
  if (!Array.isArray(clusters) || !clusters.length) return clusters;
  const hasLegacy = clusters.some((c) =>
    (c?.childProductIds || []).includes("kit-case"),
  );
  if (!hasLegacy) return clusters;
  return cloneDefaultStoreProductClusters();
}

function normalizeCluster(raw) {
  const id = String(raw?.id || "").trim();
  const label = String(raw?.label || "").trim();
  const parentRaw = raw?.parentProductId;
  const parentProductId =
    parentRaw == null || parentRaw === ""
      ? null
      : String(parentRaw).trim();
  const childProductIds = Array.isArray(raw?.childProductIds)
    ? raw.childProductIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const hint = String(raw?.compositionHint || "").trim();
  return {
    id,
    label,
    parentProductId,
    childProductIds,
    ...(hint ? { compositionHint: hint } : {}),
  };
}

/**
 * @param {unknown} clusters
 * @returns {{ ok: true, clusters: object[] } | { ok: false, message: string }}
 */
export function validateStoreProductClusters(clusters) {
  if (!Array.isArray(clusters)) {
    return { ok: false, message: "clusters_must_be_array" };
  }

  const known = new Set(listStoreProductIds());
  const seenClusterIds = new Set();
  const seenProducts = new Set();
  const normalized = [];

  for (const raw of clusters) {
    const c = normalizeCluster(raw);
    if (!c.id) return { ok: false, message: "cluster_id_required" };
    if (!c.label) return { ok: false, message: "cluster_label_required" };
    if (seenClusterIds.has(c.id)) {
      return { ok: false, message: `duplicate_cluster_id:${c.id}` };
    }
    seenClusterIds.add(c.id);

    if (c.parentProductId != null) {
      if (!known.has(c.parentProductId)) {
        return {
          ok: false,
          message: `unknown_parent_product:${c.parentProductId}`,
        };
      }
      if (seenProducts.has(c.parentProductId)) {
        return {
          ok: false,
          message: `duplicate_product:${c.parentProductId}`,
        };
      }
      seenProducts.add(c.parentProductId);
    }

    const uniqueChildren = [];
    for (const productId of c.childProductIds) {
      if (!known.has(productId)) {
        return { ok: false, message: `unknown_product:${productId}` };
      }
      if (c.parentProductId != null && productId === c.parentProductId) {
        return {
          ok: false,
          message: `parent_in_children:${productId}`,
        };
      }
      if (seenProducts.has(productId)) {
        return { ok: false, message: `duplicate_product:${productId}` };
      }
      seenProducts.add(productId);
      uniqueChildren.push(productId);
    }

    normalized.push({
      ...c,
      childProductIds: uniqueChildren,
    });
  }

  return { ok: true, clusters: normalized };
}

export async function getOrSeedStoreProductClusterLayout() {
  let doc = await StoreProductClusterLayout.findOne({ key: LAYOUT_KEY }).lean();
  if (doc?.clusters?.length) {
    const migrated = migrateLegacyKitCaseInClusters(doc.clusters);
    if (migrated !== doc.clusters) {
      doc = await StoreProductClusterLayout.findOneAndUpdate(
        { key: LAYOUT_KEY },
        { $set: { clusters: migrated } },
        { new: true },
      ).lean();
      return {
        key: LAYOUT_KEY,
        clusters: (doc?.clusters || migrated).map((c) => normalizeCluster(c)),
      };
    }
    return {
      key: LAYOUT_KEY,
      clusters: doc.clusters.map((c) => normalizeCluster(c)),
    };
  }

  const clusters = cloneDefaultStoreProductClusters();
  doc = await StoreProductClusterLayout.findOneAndUpdate(
    { key: LAYOUT_KEY },
    { $set: { clusters } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    key: LAYOUT_KEY,
    clusters: (doc?.clusters || clusters).map((c) => normalizeCluster(c)),
  };
}

/**
 * @param {unknown} clusters
 */
export async function saveStoreProductClusterLayout(clusters) {
  const validated = validateStoreProductClusters(clusters);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.statusCode = 400;
    throw err;
  }

  const doc = await StoreProductClusterLayout.findOneAndUpdate(
    { key: LAYOUT_KEY },
    { $set: { clusters: validated.clusters } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    key: LAYOUT_KEY,
    clusters: (doc?.clusters || validated.clusters).map((c) =>
      normalizeCluster(c),
    ),
  };
}

export async function resetStoreProductClusterLayout() {
  return saveStoreProductClusterLayout(cloneDefaultStoreProductClusters());
}
