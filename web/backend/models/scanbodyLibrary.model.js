// 기공소 AI 디자인 — 3Shape `.dme` 스캔바디 라이브러리.
// ownerAnchorId=null은 어벗츠 공용, 값이 있으면 그 기공소가 추가 등록한 것.
// 부품 형상(.dcm)은 형상 해시로 S3에 한 번만 둔다(scanbody-library/<hash>.dcm).
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// - web/frontend/src/shared/files/dmeLibrary.ts
import mongoose from "mongoose";

export const SCANBODY_PART_CLASSES = [
  "scanAbutment",
  "implant",
  "screw",
  "base",
  "blank",
  "analogInterface",
  "interface",
  "other",
];

const partSchema = new mongoose.Schema(
  {
    /** 3Shape `CreatorSiteID_ItemID`. 키트가 이 값으로 부품을 가리킨다. */
    partId: { type: String, required: true },
    name: { type: String, default: "" },
    partClass: { type: String, enum: SCANBODY_PART_CLASSES, default: "other" },
    hash: { type: String, required: true },
    s3Key: { type: String, required: true },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);

const kitSchema = new mongoose.Schema(
  {
    kitId: { type: String, required: true },
    name: { type: String, default: "" },
    implantPartId: { type: String, default: null },
    /** 주 스캔바디가 맨 앞, 그 뒤가 추가 스캔바디. */
    scanAbutmentPartIds: { type: [String], default: [] },
    screwPartId: { type: String, default: null },
    basePartId: { type: String, default: null },
    blankPartId: { type: String, default: null },
    /** 임플란트 카탈로그 `implantLibraryId`(제조사|시스템|계열|타입). */
    catalogIds: { type: [String], default: [] },
  },
  { _id: false },
);

const scanbodyLibrarySchema = new mongoose.Schema(
  {
    ownerAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
      index: true,
    },
    /** Materials.xml ImplantSystem Name. 같은 소유자 안에서 이 값으로 합친다. */
    systemName: { type: String, required: true, trim: true },
    /** 올린 `.dme` 파일 이름들(연도별 호환 파일을 여러 개 올려도 한 라이브러리). */
    fileNames: { type: [String], default: [] },
    containerVersions: { type: [String], default: [] },
    parts: { type: [partSchema], default: [] },
    kits: { type: [kitSchema], default: [] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

scanbodyLibrarySchema.index({ ownerAnchorId: 1, systemName: 1 }, { unique: true });
scanbodyLibrarySchema.index({ "parts.s3Key": 1 });

const ScanbodyLibrary = mongoose.model("ScanbodyLibrary", scanbodyLibrarySchema);

export default ScanbodyLibrary;
