// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/modules/salesTeam/salesTeam.routes.js
import mongoose from "mongoose";

const salesAccountSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["practice", "lab"],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    representativeName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    memo: { type: String, default: "", trim: true },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teamVisible: { type: Boolean, default: true, index: true },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

salesAccountSchema.index({ name: "text", representativeName: "text", phone: "text" });
salesAccountSchema.index({ ownerUserId: 1, kind: 1, updatedAt: -1 });

const SalesAccount = mongoose.model("SalesAccount", salesAccountSchema);

export default SalesAccount;
