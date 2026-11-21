// related files:
// - web/backend/services/producerAssignment.service.js
// - web/backend/controllers/admin/implantProducerMatch.controller.js
import mongoose from "mongoose";

const implantBrandProducerMatchSchema = new mongoose.Schema(
  {
    brandKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    implantManufacturer: { type: String, default: "", trim: true },
    implantBrand: { type: String, default: "", trim: true },
    defaultManufacturerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    alternateManufacturerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
  },
  { timestamps: true },
);

const ImplantBrandProducerMatch = mongoose.model(
  "ImplantBrandProducerMatch",
  implantBrandProducerMatchSchema,
);

export default ImplantBrandProducerMatch;
