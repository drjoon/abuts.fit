// FDI 치아(#11~#48)별 부위별 정상 크기·해부 형태·커스텀어벗 1mm 컷백 기준치 SSOT.
// 구강스캔 자연치 실측 + 기공소 보철/커스텀어벗 STL 실측 + 성인 치아 해부학 표준을 결합한다.
// related files:
// - web/backend/services/toothAnatomy.seed.js
// - web/backend/controllers/ai/toothAnatomy.controller.js
// - web/frontend/src/shared/practice/toothAnatomy.ts
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
import mongoose from "mongoose";

const crownBandSchema = new mongoose.Schema(
  {
    mdMm: { type: Number, required: true },
    blMm: { type: Number, required: true },
  },
  { _id: false },
);

const crownEquatorSchema = new mongoose.Schema(
  {
    mdMm: { type: Number, required: true },
    blMm: { type: Number, required: true },
    /** 치은연에서 순·협측 최대풍융부까지 높이 비율(0~1). */
    labialCrestRatio: { type: Number, required: true },
    /** 치은연에서 설·구개측 최대풍융부(전치·견치는 싱귤럼 정점)까지 높이 비율(0~1). */
    lingualCrestRatio: { type: Number, required: true },
  },
  { _id: false },
);

const cingulumSpecSchema = new mongoose.Schema(
  {
    hasCingulum: { type: Boolean, required: true },
    /** 마진 챔퍼 위 유지 칼라 높이 비율(이 높이 위부터 설측을 사선으로 깎는다). */
    collarHeightRatio: { type: Number, required: true },
    /** 보철 싱귤럼·설면와 확보를 위한 설측 사선 삭제 목표 각도(°). */
    bevelAngleDeg: { type: Number, required: true },
    /** 설면와 중심 오목 깊이(mm). */
    lingualFossaDepthMm: { type: Number, required: true },
  },
  { _id: false },
);

const morphologySpecSchema = new mongoose.Schema(
  {
    /** 교합면에서 본 기본 단면 형상 분류. */
    sectionShape: {
      type: String,
      enum: [
        "labial_arc_ovoid",
        "rounded_inverted_triangle_diamond",
        "ovoid_trapezoid",
        "rounded_rect",
      ],
      required: true,
    },
    /** 최대 근원심 폭 위치가 중심 대비 순·협측(+u)으로 치우친 비율(-0.5~+0.5). */
    maxMdLabialShiftRatio: { type: Number, required: true },
    /** 순·협측 볼록 모서리 지수. */
    labialExponent: { type: Number, required: true },
    /** 설·구개측 수렴 모서리 지수. */
    lingualExponent: { type: Number, required: true },
    /** 근·원심 외측 볼록 지수. */
    lateralExponent: { type: Number, required: true },
    cingulum: { type: cingulumSpecSchema, required: true },
  },
  { _id: false },
);

const abutmentCutbackSchema = new mongoose.Schema(
  {
    /** 정상 크라운 대비 부위별 목표 보철 두께(mm, 기본 1.0mm 내외). */
    crownWallLabialMm: { type: Number, required: true },
    crownWallLingualMm: { type: Number, required: true },
    crownWallProximalMm: { type: Number, required: true },
    crownWallOcclusalMm: { type: Number, required: true },
    /** 기본 피니시라인(마진) 순설·근원심 외경(mm) — 정상 크라운 출현부보다 편측 ~0.8~1.0mm 안쪽. */
    marginBlMm: { type: Number, required: true },
    marginMdMm: { type: Number, required: true },
    /** 피니시라인 최대 허용 해부 외경(mm) — 정상 크라운 풍융부 - 2×크라운두께 이내. */
    maxMarginBlMm: { type: Number, required: true },
    maxMarginMdMm: { type: Number, required: true },
    /** 포스트 최상단 순측 반폭·설측 반폭·근원심 지름(mm). */
    topLabialHalfMm: { type: Number, required: true },
    topLingualHalfMm: { type: Number, required: true },
    topMdMm: { type: Number, required: true },
    defaultPostHeightMm: { type: Number, required: true },
    lingualTopDropMm: { type: Number, required: true },
  },
  { _id: false },
);

const toothAnatomySchema = new mongoose.Schema(
  {
    /** FDI 치아 번호 ("11" ~ "48"). */
    toothNumber: { type: String, required: true, unique: true, trim: true },
    /** 상·하악 치아군 코드 ("U1" ~ "U8", "L1" ~ "L8"). */
    toothClass: { type: String, required: true, index: true, trim: true },
    jaw: { type: String, enum: ["upper", "lower"], required: true },
    quadrant: { type: Number, enum: [1, 2, 3, 4], required: true },
    position: { type: Number, min: 1, max: 8, required: true },
    kind: {
      type: String,
      enum: ["incisor", "canine", "premolar", "molar"],
      required: true,
    },
    koreanName: { type: String, required: true, trim: true },
    crown: {
      cervical: { type: crownBandSchema, required: true },
      equator: { type: crownEquatorSchema, required: true },
      occlusal: { type: crownBandSchema, required: true },
      clinicalHeightMm: { type: Number, required: true },
    },
    morphology: { type: morphologySpecSchema, required: true },
    abutmentCutback: { type: abutmentCutbackSchema, required: true },
    surveyMeta: {
      scanSampleCount: { type: Number, default: 0 },
      labCrownSampleCount: { type: Number, default: 0 },
      labAbutmentSampleCount: { type: Number, default: 0 },
      version: { type: Number, default: 1 },
    },
  },
  { timestamps: true },
);

const ToothAnatomy =
  mongoose.models.ToothAnatomy || mongoose.model("ToothAnatomy", toothAnatomySchema);

export default ToothAnatomy;
