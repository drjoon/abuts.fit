// change-log:
// - 2026-09-13: 스토어 상품 판매가·pkg가 오버라이드 SSOT.
// related files:
// - web/backend/constants/storeCatalog.js
// - web/backend/controllers/admin/adminStore.controller.js
import mongoose from "mongoose";

const storeProductPriceSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    /** 부가세 포함 판매가. null이면 카탈로그 기본. */
    listPriceInclusive: { type: Number, default: null },
    /** 부가세 포함 pkg가. null이면 카탈로그 기본. */
    packagePriceInclusive: { type: Number, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("StoreProductPrice", storeProductPriceSchema);
