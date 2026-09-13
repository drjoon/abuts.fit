// change-log:
// - 2026-09-14: 풀패키지 Surgical+Prosthetic×1 + Abutment 4종×72.
// - 2026-09-14: 풀패키지 힌트 SA-Hex/SH-Hex · Abutment 표기 Hex/NonHex.
// - 2026-09-13: Surgical Kit 클러스터 통합. 풀패키지 SA2·SH2 ×150.
// - 2026-09-13: Kit Case 3종을 각 키트 클러스터에 배치.
// - 2026-09-13: 관리자 스토어 상품 클러스터 기본 배치 SSOT.
// related files:
// - web/backend/models/storeProductClusterLayout.model.js
// - web/backend/utils/storeProductClusterLayout.js
// - web/frontend/src/pages/admin/system/AdminStorePage.tsx

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   parentProductId: string|null,
 *   childProductIds: string[],
 *   compositionHint?: string,
 * }} StoreProductCluster
 */

/** 관리자 상품 테이블 기본 클러스터 (DB 시드). */
export const STORE_DEFAULT_PRODUCT_CLUSTERS = Object.freeze([
  Object.freeze({
    id: "full-package",
    label: "500만 패키지",
    parentProductId: "full-package",
    childProductIds: Object.freeze([]),
    compositionHint: "키트 2종 + Abutment 4종 ×72",
  }),
  Object.freeze({
    id: "surgical-kit",
    label: "Surgical Kit",
    parentProductId: "surgical-kit",
    childProductIds: Object.freeze([
      "kit-case-surgical",
      "initial-pen",
      "pen",
      "cup",
      "check-pin",
      "bone-shaper",
    ]),
    compositionHint:
      "Surgical 케이스 · SurgicalPen · Pen · Cup · SurgicalPin · BoneShaper",
  }),
  Object.freeze({
    id: "prosthetic-kit",
    label: "Prosthetic Kit",
    parentProductId: "prosthetic-kit",
    childProductIds: Object.freeze([
      "kit-case-prosthetic",
      "gingival-shaper",
      "hex-driver",
      "torque-wrench",
    ]),
    compositionHint:
      "Prosthetic 케이스 · GingivalShaper(6·7·9) · Hex Driver(S/M/L) · Torque",
  }),
  Object.freeze({
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
  }),
]);

export function cloneDefaultStoreProductClusters() {
  return STORE_DEFAULT_PRODUCT_CLUSTERS.map((c) => ({
    id: c.id,
    label: c.label,
    parentProductId: c.parentProductId,
    childProductIds: [...c.childProductIds],
    ...(c.compositionHint ? { compositionHint: c.compositionHint } : {}),
  }));
}
