// related files:
// - web/backend/rules.md
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/backend/modules/labTradingPartners/labTradingPartner.routes.js
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
import mongoose from "mongoose";

const labTradingPartnerSchema = new mongoose.Schema(
  {
    labAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    practiceAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    inviteToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["invited", "active", "canceled", "expired"],
      default: "invited",
      index: true,
    },
    practiceHint: {
      name: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      memo: { type: String, default: "", trim: true },
    },
    invitedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    canceledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

labTradingPartnerSchema.index(
  { labAnchorId: 1, practiceAnchorId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      practiceAnchorId: { $type: "objectId" },
      status: "active",
    },
  },
);

labTradingPartnerSchema.index({ labAnchorId: 1, status: 1, invitedAt: -1 });

const LabTradingPartner = mongoose.model(
  "LabTradingPartner",
  labTradingPartnerSchema,
);

export default LabTradingPartner;
