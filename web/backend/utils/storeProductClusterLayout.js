// change-log:
// - 2026-10-04: 클러스터 레이아웃 key — practice/lab 분리. 레거시 default→practice 마이그레이션.
// - 2026-10-04: 판매 SKU 축소 시 알 수 없는 상품이 있는 레이아웃을 기본 클러스터로 리셋.
// - 2026-09-19: 저장 레이아웃의 구성 힌트를 신규 키트·패키지 구성으로 갱신.
// - 2026-09-13: hiddenProductIds — 미분류 상품 관리자 삭제(목록 숨김).
// - 2026-09-13: Initial/Check·kit-case-initial/check 클러스터 → Surgical 기본으로 마이그레이션.
// - 2026-09-13: 관리자 스토어 클러스터 레이아웃 로드/저장·검증.
// related files:
// - web/backend/models/storeProductClusterLayout.model.js
// - web/backend/constants/storeProductClusters.js
// - web/backend/constants/storeCatalog.js
import StoreProductClusterLayout from "../models/storeProductClusterLayout.model.js";
import {
  listStoreProductIdsForAudience,
  normalizeStoreAudience,
} from "../constants/storeCatalog.js";
import { cloneDefaultStoreProductClusters } from "../constants/storeProductClusters.js";

const LEGACY_LAYOUT_KEY = "default";
const STORE_AUDIENCE_KEYS = ["practice", "lab"];

/**
 * @param {unknown} raw
 * @returns {"practice"|"lab"}
 */
export function resolveStoreClusterLayoutKey(raw) {
  return normalizeStoreAudience(raw) || "practice";
}

/**
 * 판매 카탈로그에 없는 SKU·레거시 키트/패키지 클러스터면 기본으로 리셋.
 * @param {unknown} clusters
 * @param {"practice"|"lab"} audience
 */
function migrateLegacyOrUnknownCatalogClusters(clusters, audience) {
  if (!Array.isArray(clusters) || !clusters.length) {
    return cloneDefaultStoreProductClusters(audience);
  }
  const known = new Set(listStoreProductIdsForAudience(audience));
  const needsReset = clusters.some((c) => {
    const id = String(c?.id || "");
    const parent = String(c?.parentProductId || "");
    const children = c?.childProductIds || [];
    if (
      id === "full-package" ||
      id === "surgical-kit" ||
      id === "prosthetic-kit" ||
      id === "initial-kit" ||
      id === "check-kit"
    ) {
      return true;
    }
    if (parent && !known.has(parent)) return true;
    return children.some((productId) => !known.has(String(productId || "")));
  });
  if (!needsReset) return clusters;
  return cloneDefaultStoreProductClusters(audience);
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

function layoutPayload(doc, audience, clustersFallback = null) {
  const clusters = (doc?.clusters || clustersFallback || []).map((c) =>
    normalizeCluster(c),
  );
  return {
    key: audience,
    audience,
    clusters,
    hiddenProductIds: normalizeHiddenProductIds(doc?.hiddenProductIds),
  };
}

/**
 * @param {unknown} clusters
 * @param {"practice"|"lab"|string|null|undefined} audience
 * @returns {{ ok: true, clusters: object[] } | { ok: false, message: string }}
 */
export function validateStoreProductClusters(clusters, audience) {
  if (!Array.isArray(clusters)) {
    return { ok: false, message: "clusters_must_be_array" };
  }

  const kind = resolveStoreClusterLayoutKey(audience);
  const known = new Set(listStoreProductIdsForAudience(kind));
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

async function loadMergedHiddenProductIds() {
  const docs = await StoreProductClusterLayout.find({
    key: { $in: [...STORE_AUDIENCE_KEYS, LEGACY_LAYOUT_KEY] },
  })
    .select({ hiddenProductIds: 1 })
    .lean();
  const hidden = new Set();
  for (const doc of docs) {
    for (const id of normalizeHiddenProductIds(doc?.hiddenProductIds)) {
      hidden.add(id);
    }
  }
  return [...hidden];
}

/**
 * 레거시 key=default 문서를 practice로 승격(없을 때만).
 */
async function migrateLegacyDefaultLayoutIfNeeded() {
  const practice = await StoreProductClusterLayout.findOne({
    key: "practice",
  }).lean();
  if (practice?.clusters?.length) return;

  const legacy = await StoreProductClusterLayout.findOne({
    key: LEGACY_LAYOUT_KEY,
  }).lean();
  if (!legacy?.clusters?.length) return;

  const migrated = migrateLegacyOrUnknownCatalogClusters(
    legacy.clusters,
    "practice",
  );
  await StoreProductClusterLayout.findOneAndUpdate(
    { key: "practice" },
    {
      $set: {
        clusters: migrated,
        hiddenProductIds: normalizeHiddenProductIds(legacy.hiddenProductIds),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * @param {"practice"|"lab"|string|null|undefined} audience
 */
export async function getOrSeedStoreProductClusterLayout(audience) {
  const kind = resolveStoreClusterLayoutKey(audience);
  await migrateLegacyDefaultLayoutIfNeeded();

  let doc = await StoreProductClusterLayout.findOne({ key: kind }).lean();
  if (doc?.clusters?.length) {
    const migrated = migrateLegacyOrUnknownCatalogClusters(doc.clusters, kind);
    if (migrated !== doc.clusters) {
      doc = await StoreProductClusterLayout.findOneAndUpdate(
        { key: kind },
        { $set: { clusters: migrated } },
        { new: true },
      ).lean();
      const hiddenProductIds = await loadMergedHiddenProductIds();
      return { ...layoutPayload(doc, kind, migrated), hiddenProductIds };
    }
    const hiddenProductIds = await loadMergedHiddenProductIds();
    return { ...layoutPayload(doc, kind), hiddenProductIds };
  }

  const clusters = cloneDefaultStoreProductClusters(kind);
  doc = await StoreProductClusterLayout.findOneAndUpdate(
    { key: kind },
    { $set: { clusters } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  const hiddenProductIds = await loadMergedHiddenProductIds();
  return { ...layoutPayload(doc, kind, clusters), hiddenProductIds };
}

/**
 * @param {unknown} clusters
 * @param {"practice"|"lab"|string|null|undefined} audience
 */
export async function saveStoreProductClusterLayout(clusters, audience) {
  const kind = resolveStoreClusterLayoutKey(audience);
  const validated = validateStoreProductClusters(clusters, kind);
  if (!validated.ok) {
    const err = new Error(validated.message);
    err.statusCode = 400;
    throw err;
  }

  const doc = await StoreProductClusterLayout.findOneAndUpdate(
    { key: kind },
    { $set: { clusters: validated.clusters } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  const hiddenProductIds = await loadMergedHiddenProductIds();
  return {
    ...layoutPayload(doc, kind, validated.clusters),
    hiddenProductIds,
  };
}

/**
 * @param {"practice"|"lab"|string|null|undefined} audience
 */
export async function resetStoreProductClusterLayout(audience) {
  const kind = resolveStoreClusterLayoutKey(audience);
  return saveStoreProductClusterLayout(
    cloneDefaultStoreProductClusters(kind),
    kind,
  );
}

/**
 * 미분류(또는 목록) 상품을 관리자 재고에서 숨김. 과거 주문 표시용 이름은 유지.
 * 모든 audience 레이아웃에서 제거.
 * @param {string} productId
 * @param {"practice"|"lab"|string|null|undefined} audience — 응답 레이아웃 기준
 */
export async function hideStoreProductFromAdmin(productId, audience) {
  const key = String(productId || "").trim();
  if (!key) {
    const err = new Error("productId_required");
    err.statusCode = 400;
    throw err;
  }

  const kind = resolveStoreClusterLayoutKey(audience);
  await migrateLegacyDefaultLayoutIfNeeded();

  const docs = await StoreProductClusterLayout.find({
    key: { $in: [...STORE_AUDIENCE_KEYS, LEGACY_LAYOUT_KEY] },
  }).lean();

  const prevHidden = await loadMergedHiddenProductIds();
  const hiddenProductIds = [...new Set([...prevHidden, key])];

  for (const audienceKey of STORE_AUDIENCE_KEYS) {
    const existing = docs.find((d) => d.key === audienceKey);
    const baseClusters =
      existing?.clusters?.length
        ? existing.clusters
        : cloneDefaultStoreProductClusters(audienceKey);
    const clusters = stripProductFromClusters(baseClusters, key);
    const validated = validateStoreProductClusters(clusters, audienceKey);
    if (!validated.ok) {
      const err = new Error(validated.message);
      err.statusCode = 400;
      throw err;
    }
    await StoreProductClusterLayout.findOneAndUpdate(
      { key: audienceKey },
      {
        $set: {
          clusters: validated.clusters,
          hiddenProductIds,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  // 레거시 default도 동기(숨김 목록).
  if (docs.some((d) => d.key === LEGACY_LAYOUT_KEY)) {
    await StoreProductClusterLayout.updateOne(
      { key: LEGACY_LAYOUT_KEY },
      { $set: { hiddenProductIds } },
    );
  }

  return getOrSeedStoreProductClusterLayout(kind);
}
