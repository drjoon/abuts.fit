// change-log:
// - 2026-10-04: key — practice|lab (레거시 default는 유틸에서 practice로 승격).
// - 2026-09-13: 관리자 스토어 상품 클러스터 배치 싱글톤.
// related files:
// - web/backend/constants/storeProductClusters.js
// - web/backend/utils/storeProductClusterLayout.js
// - web/backend/controllers/admin/adminStore.controller.js
import mongoose from "mongoose";

const clusterSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    parentProductId: { type: String, default: null, trim: true },
    childProductIds: { type: [String], default: [] },
    compositionHint: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const storeProductClusterLayoutSchema = new mongoose.Schema(
  {
    /** practice | lab (레거시 default 허용). */
    key: {
      type: String,
      required: true,
      unique: true,
      default: "practice",
      trim: true,
      index: true,
    },
    hiddenProductIds: { type: [String], default: [] },
    clusters: { type: [clusterSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model(
  "StoreProductClusterLayout",
  storeProductClusterLayoutSchema,
);
