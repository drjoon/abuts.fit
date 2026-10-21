// related files:
// - web/backend/services/lowFinishLineWatch.service.js
// - web/backend/services/lowFinishLineWatch.js
import mongoose from "mongoose";

const lowFinishLineCaseSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
    },
    requestId: { type: String, trim: true, default: "" },
    minZ: { type: Number, required: true },
    clinicName: { type: String, trim: true, default: "" },
    patientName: { type: String, trim: true, default: "" },
    tooth: { type: String, trim: true, default: "" },
    connection: { type: String, trim: true, default: "" },
    /** open | success | failed | skipped. verdict가 있으면 그 값. */
    status: {
      type: String,
      enum: ["open", "success", "failed", "skipped"],
      default: "open",
    },
    /** 관리자 고정. 비어 있으면 공정 단계로 다시 계산한다. */
    verdict: {
      type: String,
      enum: ["", "success", "failed"],
      default: "",
    },
    observedAt: { type: Date, default: () => new Date() },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

lowFinishLineCaseSchema.index({ request: 1 }, { unique: true });
lowFinishLineCaseSchema.index({ requestId: 1 });
lowFinishLineCaseSchema.index({ status: 1, updatedAt: -1 });

const LowFinishLineCase =
  mongoose.models.LowFinishLineCase ||
  mongoose.model("LowFinishLineCase", lowFinishLineCaseSchema);

export default LowFinishLineCase;
