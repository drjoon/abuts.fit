// 기공소 AI 디자인 — 스캔바디 라이브러리(3Shape `.dme` · exocad).
// ownerAnchorId=null은 어벗츠 공용. 값이 있으면 그 기공소 것이고, 관리자가 isPublic으로 승격하면 모두가 쓴다.
// 형상은 서버가 검증해 새로 만든 이진 STL을 해시 키로 S3에 한 번만 둔다(scanbody-library/<hash>.stl).
// 예전 브라우저 해석 업로드는 원본 .dcm(format=dcm)이다.
// related files:
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// - web/backend/services/scanbodyLibraryImport.service.js
// - web/backend/services/scanbodyLibraryUpload.service.js
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
    /** 형상 해시. 키트가 이 값으로 부품을 가리킨다. */
    partId: { type: String, required: true },
    name: { type: String, default: "" },
    partClass: { type: String, enum: SCANBODY_PART_CLASSES, default: "other" },
    format: { type: String, enum: ["stl", "dcm"], default: "dcm" },
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
    /** 3Shape ImplantSystem Name 또는 exocad DisplayInformation. 같은 소유자 안에서 이 값으로 합친다. */
    systemName: { type: String, required: true, trim: true },
    source: { type: String, enum: ["3shape", "exocad"], default: "3shape" },
    /** 올린 파일 이름들(연도별 호환 파일을 여러 개 올려도 한 라이브러리). */
    fileNames: { type: [String], default: [] },
    containerVersions: { type: [String], default: [] },
    parts: { type: [partSchema], default: [] },
    kits: { type: [kitSchema], default: [] },
    /** 기공소 라이브러리를 관리자가 검토해 공용으로 올렸다. 올린 뒤에는 관리자만 고치고 내린다. */
    isPublic: { type: Boolean, default: false, index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  // 업로드 작업 여러 개가 같은 시스템에 합쳐질 때 서로 덮어쓰지 않게 한다.
  { timestamps: true, optimisticConcurrency: true },
);

scanbodyLibrarySchema.index({ ownerAnchorId: 1, systemName: 1 }, { unique: true });
scanbodyLibrarySchema.index({ "parts.s3Key": 1 });

const ScanbodyLibrary = mongoose.model("ScanbodyLibrary", scanbodyLibrarySchema);

export default ScanbodyLibrary;
