// 기공소 AI 디자인 — 심플어벗·심플힐링 템플릿. 3Shape 스캐너로 찍은 `.dcm`.
// 직접어벗의 심플어벗·심플밀링은 의뢰 규격(종류·직경)으로 고른다. 높이는 크라운 작업에 쓰지 않고 기록만 한다.
// 심플힐링은 스캔바디라 종류·직경·높이가 모두 맞아야 쓴다.
// 기공소가 올린 것도 악성코드 검사·해석을 통과하면 바로 공용(isPublic)이다. 관리자는 내리기만 한다.
// frame: 스캔 좌표에서 플랫폼 원점(스캔 맨 아래)과 축. 브라우저가 등록할 때 계산한다.
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// - web/frontend/src/shared/files/abutmentTemplateFrame.ts
import mongoose from "mongoose";

export const ABUTMENT_TEMPLATE_KINDS = ["심플어벗", "심플밀링", "심플힐링"];

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
    isPublic: { type: Boolean, default: false, index: true },
    /** 공용 템플릿을 올린 기공소가 다시 올린 사본이면 원본 id. 그 기공소만 쓴다. */
    forkOf: { type: mongoose.Schema.Types.ObjectId, ref: "AbutmentTemplate", default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// 예전 인덱스 { ownerAnchorId, kind, diameter, height }는 scripts/db/migrate-scanbody-fork-indexes.js로 바꾼다.
abutmentTemplateSchema.index(
  { ownerAnchorId: 1, kind: 1, diameter: 1, height: 1, forkOf: 1 },
  { unique: true },
);
abutmentTemplateSchema.index({ s3Key: 1 });

const AbutmentTemplate = mongoose.model("AbutmentTemplate", abutmentTemplateSchema);

export default AbutmentTemplate;
