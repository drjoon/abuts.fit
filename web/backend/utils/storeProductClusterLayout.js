// change-log:
// - 2026-09-19: 저장 레이아웃의 구성 힌트를 신규 키트·패키지 구성으로 갱신.
// - 2026-09-13: hiddenProductIds — 미분류 상품 관리자 삭제(목록 숨김).
// - 2026-09-13: Initial/Check·kit-case-initial/check 클러스터 → Surgical 기본으로 마이그레이션.
// - 2026-09-13: 관리자 스토어 클러스터 레이아웃 로드/저장·검증.
// related files:
// - web/backend/models/storeProductClusterLayout.model.js
// - web/backend/constants/storeProductClusters.js
// - web/backend/constants/storeCatalog.js
import StoreProductClusterLayout from "../models/storeProductClusterLayout.model.js";
import { listStoreProductIds } from "../constants/storeCatalog.js";
import { cloneDefaultStoreProductClusters } from "../constants/storeProductClusters.js";

const LAYOUT_KEY = "default";

/** 레거시 Initial/Check 키트·단일 kit-case → Surgical 기본 클러스터. */
function migrateLegacyKitCaseInClusters(clusters) {
  if (!Array.isArray(clusters) || !clusters.length) return clusters;
  const needsReset = clusters.some((c) => {
    const id = String(c?.id || "");
    const parent = String(c?.parentProductId || "");
    const children = c?.childProductIds || [];
    return (
      id === "initial-kit" ||
      id === "check-kit" ||
      parent === "initial-kit" ||
      parent === "check-kit" ||
      children.includes("kit-case") ||
      children.includes("kit-case-initial") ||
      children.includes("kit-case-check")
    );
  });
  if (!needsReset) return clusters;
  return cloneDefaultStoreProductClusters();
}

/** 2026-09-19 구성 힌트. 저장된 레이아웃의 힌트만 갱신하고 배치는 유지. */
const COMPOSITION_HINTS = Object.freeze({
  "full-package": "키트 2종 + Abutment 4종 ×60",
  "surgical-kit":
    "Surgical 케이스 · Pen-Drill · Pen-Cup · SurgicalPin · BoneShaper",
  "prosthetic-kit":
    "Prosthetic 케이스 · GingivalShaper(6·7·9) · Grip Driver(5) · Scan bar · Torque",
});

function migrateCompositionHints(clusters) {
  if (!Array.isArray(clusters) || !clusters.length) return clusters;
  let changed = false;
  const next = clusters.map((c) => {
    const id = String(c?.id || "");
    const hint = COMPOSITION_HINTS[id];
    if (!hint || String(c?.compositionHint || "") === hint) return c;
    changed = true;
    return { ...c, compositionHint: hint };
  });
  return changed ? next : clusters;
}

function normalizeHiddenProductIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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

function layoutPayload(doc, clustersFallback = null) {
  const clusters = (doc?.clusters || clustersFallback || []).map((c) =>
    normalizeCluster(c),
  );
  return {
    key: LAYOUT_KEY,
    clusters,
    hiddenProductIds: normalizeHiddenProductIds(doc?.hiddenProductIds),
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

function stripProductFromClusters(clusters, productId) {
  return (clusters || []).map((c) => {
    const next = normalizeCluster(c);
    return {
      ...next,
      parentProductId:
        next.parentProductId === productId ? null : next.parentProductId,
      childProductIds: next.childProductIds.filter((id) => id !== productId),
    };
  });
}

export async function getOrSeedStoreProductClusterLayout() {
  let doc = await StoreProductClusterLayout.findOne({ key: LAYOUT_KEY }).lean();
  if (doc?.clusters?.length) {
    const migratedLegacy = migrateLegacyKitCaseInClusters(doc.clusters);
    const migrated = migrateCompositionHints(migratedLegacy);
    if (migrated !== doc.clusters) {
      doc = await StoreProductClusterLayout.findOneAndUpdate(
        { key: LAYOUT_KEY },
        { $set: { clusters: migrated } },
        { new: true },
      ).lean();
      return layoutPayload(doc, migrated);
    }
    return layoutPayload(doc);
  }

  const clusters = cloneDefaultStoreProductClusters();
  doc = await StoreProductClusterLayout.findOneAndUpdate(
    { key: LAYOUT_KEY },
    { $set: { clusters } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return layoutPayload(doc, clusters);
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

  return layoutPayload(doc, validated.clusters);
}

export async function resetStoreProductClusterLayout() {
  return saveStoreProductClusterLayout(cloneDefaultStoreProductClusters());
}

/**
 * 미분류(또는 목록) 상품을 관리자 재고에서 숨김. 과거 주문 표시용 이름은 유지.
 * @param {string} productId
 */
export async function hideStoreProductFromAdmin(productId) {
  const key = String(productId || "").trim();
  if (!key) {
    const err = new Error("productId_required");
    err.statusCode = 400;
    throw err;
  }

  const current = await getOrSeedStoreProductClusterLayout();
  const hidden = new Set(current.hiddenProductIds);
  hidden.add(key);
  const hiddenProductIds = [...hidden];
  const clusters = stripProductFromClusters(current.clusters, key);

  // 숨긴 상품은 클러스터 검증 known에서 빠져도 되므로, 남은 클러스터만 검증.
  const validated = validateStoreProductClusters(clusters);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.statusCode = 400;
    throw err;
  }

  const doc = await StoreProductClusterLayout.findOneAndUpdate(
    { key: LAYOUT_KEY },
    {
      $set: {
        clusters: validated.clusters,
        hiddenProductIds,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return layoutPayload(doc, validated.clusters);
}
