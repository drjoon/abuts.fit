// 기공소 AI 디자인 — 스캔바디 라이브러리(3Shape `.dme` · exocad).
// ownerAnchorId=null은 어벗츠 공용. 값이 있으면 그 기공소가 올린 것이고, 검사를 통과하면 isPublic으로 모두가 쓴다.
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
    /** 모델 좌표(축 +Y) 폭. 의뢰 스캔바디 「직경/높이」로 후보를 거른다. 예전 업로드는 null. */
    diameterMm: { type: Number, default: null },
    heightMm: { type: Number, default: null },
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
    /** 라이브러리 코드에서 뗀 규격. 예: `LL H55`, `LS`, `CMFit`. */
    spec: { type: String, default: "" },
    /** 파일에 있던 원래 코드. 예: `C1W_LL_H55`. */
    code: { type: String, default: "" },
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
    /** scan: 기공소가 스캔하거나 다른 CAD에서 내보낸 형상 한 개(.dcm·.stl·.ply·.obj). */
    /** generated: 관리자 스캔바디 생성기(STEP + 스펙 메타데이터). */
    source: { type: String, enum: ["3shape", "exocad", "scan", "generated"], default: "3shape" },
    /** 올린 파일 이름들(연도별 호환 파일을 여러 개 올려도 한 라이브러리). */
    fileNames: { type: [String], default: [] },
    containerVersions: { type: [String], default: [] },
    /**
     * 올릴 때 받은 제조사 이름(의뢰의 스캔바디 제조사, 예: 지오메디).
     * 3Shape 시스템 이름은 코드(ISR_LS 등)라 제조사를 알 수 없다.
     */
    manufacturers: { type: [String], default: [] },
    /** 파일 경로·XML에 있던 임플란트 제조사. 예: OSSTEM. */
    implantManufacturer: { type: String, default: "" },
    /** 임플란트 브랜드. 예: US, TS3. */
    brand: { type: String, default: "" },
    /** 연결·타입. 규격 접미사를 뺀 코드. 예: BG41, C1W. */
    implantType: { type: String, default: "" },
    parts: { type: [partSchema], default: [] },
    kits: { type: [kitSchema], default: [] },
    /**
     * 모두가 쓰는 라이브러리. 기공소 업로드는 악성코드 검사·해석을 통과하면 바로 공용이 된다.
     * 관리자가 내리면(reviewedAt 있음 + false) 다시 올려도 공용으로 돌아가지 않는다.
     */
    isPublic: { type: Boolean, default: false, index: true },
    /**
     * 공용 라이브러리를 한 기공소가 고친 사본이면 원본 id. 사본은 그 기공소만 보고, 그 기공소에는 원본 대신 보인다.
     * 공용 원본은 다른 기공소가 쓰고 있어 기공소가 직접 고치지 않는다.
     */
    forkOf: { type: mongoose.Schema.Types.ObjectId, ref: "ScanbodyLibrary", default: null },
    /** 업로드로 키트·형상이 바뀐 시각(제조사 새 버전 등). 임플란트 연결만 고친 것은 넣지 않는다. */
    contentUpdatedAt: { type: Date, default: null },
    /** 사본을 만들 때 원본의 contentUpdatedAt. 원본이 그 뒤에 바뀌면 기공소에 「새 공용」을 알린다. */
    forkBaseContentAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  // 업로드 작업 여러 개가 같은 시스템에 합쳐질 때 서로 덮어쓰지 않게 한다.
  { timestamps: true, optimisticConcurrency: true },
);

// 예전 인덱스 { ownerAnchorId, systemName }는 scripts/db/migrate-scanbody-fork-indexes.js로 바꾼다.
scanbodyLibrarySchema.index({ ownerAnchorId: 1, systemName: 1, forkOf: 1 }, { unique: true });
scanbodyLibrarySchema.index({ "parts.s3Key": 1 });

const ScanbodyLibrary = mongoose.model("ScanbodyLibrary", scanbodyLibrarySchema);

export default ScanbodyLibrary;
