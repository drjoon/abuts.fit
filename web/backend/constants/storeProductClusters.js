// change-log:
// - 2026-10-04: 클러스터 기본 배치 — practice/lab 분리. Grip Driver는 치과만.
// - 2026-10-04: Abutment 4종 + Grip Driver만. 키트·패키지 클러스터 제거.
// - 2026-09-19: 풀패키지 Abutment 4종×60. Prosthetic Grip Driver·Scan bar.
// - 2026-09-14: 풀패키지 Surgical+Prosthetic×1 + Abutment 4종×72.
// - 2026-09-14: 풀패키지 힌트 SA-Hex/SH-Hex · Abutment 표기 Hex/NonHex.
// - 2026-09-13: Surgical Kit 클러스터 통합. 풀패키지 SA2·SH2 ×150.
// - 2026-09-13: Kit Case 3종을 각 키트 클러스터에 배치.
// - 2026-09-13: 관리자 스토어 상품 클러스터 기본 배치 SSOT.
// related files:
// - web/backend/models/storeProductClusterLayout.model.js
// - web/backend/utils/storeProductClusterLayout.js
// - web/frontend/src/pages/admin/system/AdminStorePage.tsx
// - web/backend/constants/storeCatalog.js
import { normalizeStoreAudience } from "./storeCatalog.js";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   parentProductId: string|null,
 *   childProductIds: string[],
 *   compositionHint?: string,
 * }} StoreProductCluster
 */

const ABUTMENT_CLUSTER = Object.freeze({
  id: "abutment",
  label: "Abutment",
  parentProductId: null,
  childProductIds: Object.freeze([
    "simple-abutment-2",
    "simple-healing-2",
    "simple-abutment",
    "simple-healing",
  ]),
  compositionHint: "SimpleAbutment-Hex/NonHex · SimpleHealing-Hex/NonHex",
});

const GRIP_DRIVER_CLUSTER = Object.freeze({
  id: "grip-driver",
  label: "Grip Driver",
  parentProductId: null,
  childProductIds: Object.freeze(["hex-driver"]),
  compositionHint: "Hand S·M·L · Handpiece M·L",
});

/** 관리자 상품 테이블 기본 클러스터 (DB 시드) — 대상별. */
export const STORE_DEFAULT_PRODUCT_CLUSTERS_BY_AUDIENCE = Object.freeze({
  practice: Object.freeze([ABUTMENT_CLUSTER, GRIP_DRIVER_CLUSTER]),
  lab: Object.freeze([ABUTMENT_CLUSTER]),
});

/** @deprecated practice 기본과 동일. audience별 헬퍼 사용. */
export const STORE_DEFAULT_PRODUCT_CLUSTERS =
  STORE_DEFAULT_PRODUCT_CLUSTERS_BY_AUDIENCE.practice;

function cloneCluster(c) {
  return {
    id: c.id,
    label: c.label,
    parentProductId: c.parentProductId,
    childProductIds: [...c.childProductIds],
    ...(c.compositionHint ? { compositionHint: c.compositionHint } : {}),
  };
}

/**
 * @param {"practice"|"lab"|string|null|undefined} audience
 */
export function cloneDefaultStoreProductClusters(audience = "practice") {
  const kind = normalizeStoreAudience(audience) || "practice";
  const source =
    STORE_DEFAULT_PRODUCT_CLUSTERS_BY_AUDIENCE[kind] ||
    STORE_DEFAULT_PRODUCT_CLUSTERS_BY_AUDIENCE.practice;
  return source.map(cloneCluster);
}
