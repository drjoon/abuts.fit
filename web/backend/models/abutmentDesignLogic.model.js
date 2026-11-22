// 확정 디자인의 원점·최종 차이, 관리자가 반영한 치종 생성 보정.
// 큰 본문은 S3, 몽고에는 요약과 포인터만 둔다.
// related files:
// - web/backend/services/abutmentDesignLogic.service.js
// - web/backend/services/abutmentDesignLogic.core.js
import mongoose from "mongoose";

const editSchema = new mongoose.Schema(
  {
    transferId: { type: String, required: true, trim: true },
    toothNumber: { type: String, required: true, trim: true },
    toothKind: {
      type: String,
      enum: ["incisor", "canine", "premolar", "molar"],
      required: true,
    },
    axis: { type: String, required: true, trim: true },
    before: { type: Number, required: true },
    after: { type: Number, required: true },
    delta: { type: Number, required: true },
    action: { type: String, enum: ["confirm", "manual"], default: "confirm" },
    patientName: { type: String, default: "", trim: true },
    practiceName: { type: String, default: "", trim: true },
    practiceBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** 비어 있으면 패턴 후보. pending 은 열린 제안, approved·dismissed 는 다시 세지 않는다. */
    disposition: {
      type: String,
      enum: ["pending", "approved", "dismissed"],
      default: null,
    },
    proposalId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

editSchema.index({ transferId: 1, toothNumber: 1, axis: 1 }, { unique: true });
editSchema.index({ disposition: 1, updatedAt: -1 });

const sampleSchema = new mongoose.Schema(
  {
    transferId: { type: String, default: "", trim: true },
    patientName: { type: String, default: "", trim: true },
    practiceName: { type: String, default: "", trim: true },
    toothNumber: { type: String, default: "", trim: true },
    changeText: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const proposalSchema = new mongoose.Schema(
  {
    toothKind: {
      type: String,
      enum: ["incisor", "canine", "premolar", "molar"],
      required: true,
    },
    axis: { type: String, required: true, trim: true },
    delta: { type: Number, required: true },
    changeLabel: { type: String, default: "", trim: true },
    summary: { type: String, default: "", trim: true },
    detail: { type: String, default: "", trim: true },
    applyText: { type: String, default: "", trim: true },
    beforeText: { type: String, default: "", trim: true },
    afterText: { type: String, default: "", trim: true },
    samples: { type: [sampleSchema], default: [] },
    observationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ["pending", "approved", "dismissed"], default: "pending" },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

proposalSchema.index(
  { toothKind: 1, axis: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

const ruleSchema = new mongoose.Schema(
  {
    toothKind: {
      type: String,
      enum: ["incisor", "canine", "premolar", "molar"],
      required: true,
    },
    axis: { type: String, required: true, trim: true },
    /** 승인분이 누적된 보정. 다음 케이스 생성에 더한다. */
    delta: { type: Number, required: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

ruleSchema.index({ toothKind: 1, axis: 1 }, { unique: true });

export const AbutmentDesignEdit =
  mongoose.models.AbutmentDesignEdit || mongoose.model("AbutmentDesignEdit", editSchema);
export const AbutmentDesignLogicProposal =
  mongoose.models.AbutmentDesignLogicProposal ||
  mongoose.model("AbutmentDesignLogicProposal", proposalSchema);
export const AbutmentDesignLogicRule =
  mongoose.models.AbutmentDesignLogicRule ||
  mongoose.model("AbutmentDesignLogicRule", ruleSchema);

const changeSchema = new mongoose.Schema(
  {
    transferId: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    practiceBusinessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    practiceName: { type: String, default: "", trim: true },
    editorName: { type: String, default: "", trim: true },
    patientName: { type: String, default: "", trim: true },
    action: { type: String, enum: ["confirm", "manual"], default: "confirm" },
    /** pending 은 관리자 확인 전. user·global 은 반영됨. dismissed 는 건너뜀. */
    status: {
      type: String,
      enum: ["pending", "user", "global", "dismissed"],
      default: "pending",
    },
    lines: { type: [String], default: [] },
    toothNumbers: { type: [String], default: [] },
    /** 32KB 이하 본문. 더 크면 s3Key. */
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    s3Key: { type: String, default: "", trim: true },
    bytes: { type: Number, default: 0 },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

changeSchema.index({ transferId: 1, status: 1 });
changeSchema.index({ status: 1, updatedAt: -1 });

const generationRuleSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ["global", "user"], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    toothKind: {
      type: String,
      enum: ["incisor", "canine", "premolar", "molar"],
      required: true,
    },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    pose: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

generationRuleSchema.index({ scope: 1, toothKind: 1, userId: 1 }, { unique: true });

export const AbutmentDesignChange =
  mongoose.models.AbutmentDesignChange || mongoose.model("AbutmentDesignChange", changeSchema);
export const AbutmentDesignGenerationRule =
  mongoose.models.AbutmentDesignGenerationRule ||
  mongoose.model("AbutmentDesignGenerationRule", generationRuleSchema);
