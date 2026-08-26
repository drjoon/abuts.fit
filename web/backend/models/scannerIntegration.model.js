// related files:
// - web/backend/controllers/integrations/threeShape.controller.js
// - web/backend/services/integrations/threeShape/syncLabInbox.js
// - web/backend/utils/scannerIntegrationCrypto.js
import mongoose from "mongoose";

const scannerIntegrationSchema = new mongoose.Schema(
  {
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["3shape"],
      required: true,
      default: "3shape",
      trim: true,
    },
    status: {
      type: String,
      enum: ["disconnected", "pending", "connected", "error"],
      default: "disconnected",
      index: true,
    },
    externalAccountEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    externalAccountId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    // AES-GCM cipher (iv.tag.ciphertext). Never return to clients.
    credentialsCipher: {
      type: String,
      default: "",
      select: false,
    },
    scopes: {
      type: [String],
      default: [],
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
    },
    connectedAt: {
      type: Date,
      default: null,
    },
    connectedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    disconnectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

scannerIntegrationSchema.index(
  { businessAnchorId: 1, provider: 1 },
  { unique: true },
);

const ScannerIntegration = mongoose.model(
  "ScannerIntegration",
  scannerIntegrationSchema,
);

export default ScannerIntegration;
