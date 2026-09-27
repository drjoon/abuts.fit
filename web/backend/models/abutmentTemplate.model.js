// 기공소 AI 디자인 — 심플어벗 템플릿. 3Shape 스캐너로 찍은 심플어벗 `.dcm`.
// 의뢰의 심플어벗 규격(종류·직경)으로 고른다. 높이는 크라운 작업에 쓰지 않고 기록만 한다.
// frame: 스캔 좌표에서 플랫폼 원점(스캔 맨 아래)과 축. 브라우저가 등록할 때 계산한다.
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// - web/frontend/src/shared/files/abutmentTemplateFrame.ts
import mongoose from "mongoose";

export const ABUTMENT_TEMPLATE_KINDS = ["심플어벗", "심플밀링"];

const vec3 = {
  type: [Number],
  validate: {
    validator: (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    message: "vec3 required",
  },
};

const abutmentTemplateSchema = new mongoose.Schema(
  {
    ownerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    kind: { type: String, enum: ABUTMENT_TEMPLATE_KINDS, required: true },
    diameter: { type: String, required: true, trim: true },
    height: { type: String, default: "", trim: true },
    fileName: { type: String, default: "" },
    hash: { type: String, required: true },
    s3Key: { type: String, required: true },
    size: { type: Number, default: 0 },
    frame: {
      origin: vec3,
      axis: vec3,
      /** 축 둘레 기준 방향(축에 수직). */
      ref: vec3,
    },
    /** 플랫폼에서 마진(최대 지름 어깨)까지 높이(mm). */
    marginHeightMm: { type: Number, default: 0 },
    maxDiameterMm: { type: Number, default: 0 },
    heightMm: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

abutmentTemplateSchema.index(
  { ownerAnchorId: 1, kind: 1, diameter: 1, height: 1 },
  { unique: true },
);
abutmentTemplateSchema.index({ s3Key: 1 });

const AbutmentTemplate = mongoose.model("AbutmentTemplate", abutmentTemplateSchema);

export default AbutmentTemplate;
