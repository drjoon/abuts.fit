// change-log:
// - 2026-08-23: 스토어 기성품 재고 SSOT.
// related files:
// - web/backend/services/storeSale.service.js
// - web/backend/constants/storeCatalog.js
import mongoose from "mongoose";

const storeInventorySchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    qtyOnHand: { type: Number, required: true, min: 0, default: 0 },
    qtyReserved: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("StoreInventory", storeInventorySchema);
