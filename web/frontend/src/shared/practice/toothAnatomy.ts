// FDI 32개 영구치(#11~#48) 부위별 정상 크기·해부 형태·커스텀어벗 1mm 컷백 SSOT.
// 백엔드 ToothAnatomy DB(`/api/ai/tooth-anatomy`)와 동일한 스키마·기본값을 공유하고,
// 세션당 1회 DB 카탈로그를 동기화하여 오프라인·테스트·초기 렌더에서도 지연 없이 즉시 참조한다.
// related files:
// - web/backend/models/toothAnatomy.model.js
// - web/backend/services/toothAnatomy.seed.js
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/practice/toothMorphology.ts

import { request } from "@/shared/api/apiClient";
import { fdiToothDigits } from "@/shared/practice/toothArchOrder";
import type { ToothKind } from "@/shared/practice/toothMorphology";

export const TOOTH_ANATOMY_VERSION = 2;

export type CrownWallThicknessStandard = {
  occlusalMinMm: number;
  occlusalIdealMm: number;
  proximalMinMm: number;
  proximalIdealMm: number;
  buccolingualMinMm: number;
  buccolingualIdealMm: number;
};

/**
 * 부위별 크라운 두께 SSOT.
 * - 소·대구치: 교합면 최소 0.7 / 적정 1.2mm, 근원심 최소 0.5 / 적정 1.0mm, 협설 최소 1.0 / 적정 1.5mm
 * - 전치: 절단면 최소 1.0 / 적정 1.5~2.0mm, 근원심 최소 0.5 / 적정 1.0mm, 순설 최소 0.5 / 적정 1.0mm
 */
export function getCrownWallThicknessStandard(toothNumber: string): CrownWallThicknessStandard {
  const digits = fdiToothDigits(toothNumber);
  const pos = Number(digits.slice(1));
  const anterior = pos >= 1 && pos <= 3;
  if (anterior) {
    return {
      occlusalMinMm: 1.0,
      occlusalIdealMm: pos === 1 ? 1.7 : pos === 2 ? 1.6 : 1.75,
      proximalMinMm: 0.5,
      proximalIdealMm: 1.0,
      buccolingualMinMm: 0.5,
      buccolingualIdealMm: 1.0,
    };
  }
  return {
    occlusalMinMm: 0.7,
    occlusalIdealMm: 1.2,
    proximalMinMm: 0.5,
    proximalIdealMm: 1.0,
    buccolingualMinMm: 1.0,
    buccolingualIdealMm: 1.5,
  };
}

export type ToothSectionShape =
  | "labial_arc_ovoid"
  | "rounded_inverted_triangle_diamond"
  | "ovoid_trapezoid"
  | "rounded_rect";

export type ToothAnatomySpec = {
  toothNumber: string;
  toothClass: string;
  jaw: "upper" | "lower";
  quadrant: 1 | 2 | 3 | 4;
  position: number;
  kind: ToothKind;
  koreanName: string;
  crown: {
    cervical: { mdMm: number; blMm: number };
    equator: {
      mdMm: number;
      blMm: number;
      labialCrestRatio: number;
      lingualCrestRatio: number;
    };
    occlusal: { mdMm: number; blMm: number };
    clinicalHeightMm: number;
  };
  morphology: {
    sectionShape: ToothSectionShape;
    maxMdLabialShiftRatio: number;
    labialExponent: number;
    lingualExponent: number;
    lateralExponent: number;
    cingulum: {
      hasCingulum: boolean;
      collarHeightRatio: number;
      bevelAngleDeg: number;
      lingualFossaDepthMm: number;
    };
  };
  abutmentCutback: {
    crownWallLabialMm: number;
    crownWallLingualMm: number;
    crownWallProximalMm: number;
    crownWallOcclusalMm: number;
    marginBlMm: number;
    marginMdMm: number;
    maxMarginBlMm: number;
    maxMarginMdMm: number;
    topLabialHalfMm: number;
    topLingualHalfMm: number;
    topMdMm: number;
    defaultPostHeightMm: number;
    lingualTopDropMm: number;
  };
};

type ToothClassSeed = Omit<ToothAnatomySpec, "toothNumber" | "quadrant">;

const DEFAULT_TOOTH_CLASS_SPECS: readonly ToothClassSeed[] = [
  {
    toothClass: "U1",
    jaw: "upper",
    position: 1,
    kind: "incisor",
    koreanName: "상악 중절치",
    crown: {
      cervical: { mdMm: 6.4, blMm: 6.3 },
      equator: { mdMm: 8.5, blMm: 7.2, labialCrestRatio: 0.28, lingualCrestRatio: 0.25 },
      occlusal: { mdMm: 8.1, blMm: 4.4 },
      clinicalHeightMm: 9.8,
    },
    morphology: {
      sectionShape: "labial_arc_ovoid",
      maxMdLabialShiftRatio: 0.24,
      labialExponent: 1.72,
      lingualExponent: 1.28,
      lateralExponent: 1.55,
      cingulum: { hasCingulum: true, collarHeightRatio: 0.58, bevelAngleDeg: 31, lingualFossaDepthMm: 0.65 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.0,
      crownWallLingualMm: 1.0,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.7,
      marginBlMm: 4.65,
      marginMdMm: 5.05,
      maxMarginBlMm: 5.15,
      maxMarginMdMm: 5.55,
      topLabialHalfMm: 1.12,
      topLingualHalfMm: 0.72,
      topMdMm: 3.55,
      defaultPostHeightMm: 7.2,
      lingualTopDropMm: 0.35,
    },
  },
  {
    toothClass: "U2",
    jaw: "upper",
    position: 2,
    kind: "incisor",
    koreanName: "상악 측절치",
    crown: {
      cervical: { mdMm: 4.9, blMm: 5.6 },
      equator: { mdMm: 6.6, blMm: 6.4, labialCrestRatio: 0.28, lingualCrestRatio: 0.25 },
      occlusal: { mdMm: 6.2, blMm: 4.0 },
      clinicalHeightMm: 8.8,
    },
    morphology: {
      sectionShape: "labial_arc_ovoid",
      maxMdLabialShiftRatio: 0.23,
      labialExponent: 1.68,
      lingualExponent: 1.26,
      lateralExponent: 1.52,
      cingulum: { hasCingulum: true, collarHeightRatio: 0.58, bevelAngleDeg: 29, lingualFossaDepthMm: 0.58 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.0,
      crownWallLingualMm: 1.0,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.65,
      marginBlMm: 4.25,
      marginMdMm: 4.45,
      maxMarginBlMm: 4.7,
      maxMarginMdMm: 4.9,
      topLabialHalfMm: 1.02,
      topLingualHalfMm: 0.68,
      topMdMm: 3.05,
      defaultPostHeightMm: 6.8,
      lingualTopDropMm: 0.34,
    },
  },
  {
    toothClass: "U3",
    jaw: "upper",
    position: 3,
    kind: "canine",
    koreanName: "상악 견치",
    crown: {
      cervical: { mdMm: 5.6, blMm: 6.9 },
      equator: { mdMm: 7.5, blMm: 7.9, labialCrestRatio: 0.3, lingualCrestRatio: 0.27 },
      occlusal: { mdMm: 6.5, blMm: 4.7 },
      clinicalHeightMm: 9.8,
    },
    morphology: {
      sectionShape: "rounded_inverted_triangle_diamond",
      maxMdLabialShiftRatio: 0.27,
      labialExponent: 1.34,
      lingualExponent: 1.18,
      lateralExponent: 1.4,
      cingulum: { hasCingulum: true, collarHeightRatio: 0.58, bevelAngleDeg: 32, lingualFossaDepthMm: 0.72 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.0,
      crownWallLingualMm: 1.0,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.75,
      marginBlMm: 5.15,
      marginMdMm: 4.95,
      maxMarginBlMm: 5.6,
      maxMarginMdMm: 5.4,
      topLabialHalfMm: 1.18,
      topLingualHalfMm: 0.76,
      topMdMm: 3.25,
      defaultPostHeightMm: 7.3,
      lingualTopDropMm: 0.38,
    },
  },
  {
    toothClass: "U4",
    jaw: "upper",
    position: 4,
    kind: "premolar",
    koreanName: "상악 제1소구치",
    crown: {
      cervical: { mdMm: 4.9, blMm: 7.7 },
      equator: { mdMm: 7.0, blMm: 8.9, labialCrestRatio: 0.36, lingualCrestRatio: 0.46 },
      occlusal: { mdMm: 6.4, blMm: 7.5 },
      clinicalHeightMm: 8.2,
    },
    morphology: {
      sectionShape: "ovoid_trapezoid",
      maxMdLabialShiftRatio: 0.14,
      labialExponent: 2.26,
      lingualExponent: 2.58,
      lateralExponent: 2.4,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 5.55,
      marginMdMm: 4.85,
      maxMarginBlMm: 5.95,
      maxMarginMdMm: 5.25,
      topLabialHalfMm: 2.15,
      topLingualHalfMm: 2.05,
      topMdMm: 3.65,
      defaultPostHeightMm: 5.6,
      lingualTopDropMm: 0.18,
    },
  },
  {
    toothClass: "U5",
    jaw: "upper",
    position: 5,
    kind: "premolar",
    koreanName: "상악 제2소구치",
    crown: {
      cervical: { mdMm: 4.8, blMm: 7.6 },
      equator: { mdMm: 6.9, blMm: 8.8, labialCrestRatio: 0.36, lingualCrestRatio: 0.46 },
      occlusal: { mdMm: 6.3, blMm: 7.4 },
      clinicalHeightMm: 7.9,
    },
    morphology: {
      sectionShape: "ovoid_trapezoid",
      maxMdLabialShiftRatio: 0.12,
      labialExponent: 2.28,
      lingualExponent: 2.55,
      lateralExponent: 2.4,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 5.45,
      marginMdMm: 4.75,
      maxMarginBlMm: 5.85,
      maxMarginMdMm: 5.15,
      topLabialHalfMm: 2.12,
      topLingualHalfMm: 2.02,
      topMdMm: 3.6,
      defaultPostHeightMm: 5.6,
      lingualTopDropMm: 0.18,
    },
  },
  {
    toothClass: "U6",
    jaw: "upper",
    position: 6,
    kind: "molar",
    koreanName: "상악 제1대구치",
    crown: {
      cervical: { mdMm: 8.0, blMm: 9.8 },
      equator: { mdMm: 10.3, blMm: 11.1, labialCrestRatio: 0.35, lingualCrestRatio: 0.46 },
      occlusal: { mdMm: 9.6, blMm: 9.6 },
      clinicalHeightMm: 7.5,
    },
    morphology: {
      sectionShape: "rounded_rect",
      maxMdLabialShiftRatio: 0.04,
      labialExponent: 3.15,
      lingualExponent: 3.15,
      lateralExponent: 3.15,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 6.85,
      marginMdMm: 6.65,
      maxMarginBlMm: 7.35,
      maxMarginMdMm: 7.15,
      topLabialHalfMm: 2.75,
      topLingualHalfMm: 2.75,
      topMdMm: 5.45,
      defaultPostHeightMm: 5.5,
      lingualTopDropMm: 0.12,
    },
  },
  {
    toothClass: "U7",
    jaw: "upper",
    position: 7,
    kind: "molar",
    koreanName: "상악 제2대구치",
    crown: {
      cervical: { mdMm: 7.5, blMm: 9.4 },
      equator: { mdMm: 9.6, blMm: 10.6, labialCrestRatio: 0.35, lingualCrestRatio: 0.46 },
      occlusal: { mdMm: 8.9, blMm: 9.1 },
      clinicalHeightMm: 7.2,
    },
    morphology: {
      sectionShape: "rounded_rect",
      maxMdLabialShiftRatio: 0.04,
      labialExponent: 3.15,
      lingualExponent: 3.15,
      lateralExponent: 3.15,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 6.55,
      marginMdMm: 6.35,
      maxMarginBlMm: 6.95,
      maxMarginMdMm: 6.8,
      topLabialHalfMm: 2.65,
      topLingualHalfMm: 2.65,
      topMdMm: 5.2,
      defaultPostHeightMm: 5.5,
      lingualTopDropMm: 0.12,
    },
  },
  {
    toothClass: "U8",
    jaw: "upper",
    position: 8,
    kind: "molar",
    koreanName: "상악 제3대구치",
    crown: {
      cervical: { mdMm: 7.0, blMm: 8.8 },
      equator: { mdMm: 9.0, blMm: 10.0, labialCrestRatio: 0.35, lingualCrestRatio: 0.46 },
      occlusal: { mdMm: 8.3, blMm: 8.6 },
      clinicalHeightMm: 6.8,
    },
    morphology: {
      sectionShape: "rounded_rect",
      maxMdLabialShiftRatio: 0.04,
      labialExponent: 3.05,
      lingualExponent: 3.05,
      lateralExponent: 3.05,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 6.15,
      marginMdMm: 6.0,
      maxMarginBlMm: 6.55,
      maxMarginMdMm: 6.45,
      topLabialHalfMm: 2.5,
      topLingualHalfMm: 2.5,
      topMdMm: 4.95,
      defaultPostHeightMm: 5.2,
      lingualTopDropMm: 0.12,
    },
  },
  {
    toothClass: "L1",
    jaw: "lower",
    position: 1,
    kind: "incisor",
    koreanName: "하악 중절치",
    crown: {
      cervical: { mdMm: 3.7, blMm: 5.1 },
      equator: { mdMm: 5.3, blMm: 5.8, labialCrestRatio: 0.26, lingualCrestRatio: 0.24 },
      occlusal: { mdMm: 5.1, blMm: 3.6 },
      clinicalHeightMm: 8.8,
    },
    morphology: {
      sectionShape: "labial_arc_ovoid",
      maxMdLabialShiftRatio: 0.22,
      labialExponent: 1.68,
      lingualExponent: 1.26,
      lateralExponent: 1.5,
      cingulum: { hasCingulum: true, collarHeightRatio: 0.58, bevelAngleDeg: 28, lingualFossaDepthMm: 0.45 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.0,
      crownWallLingualMm: 1.0,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.6,
      marginBlMm: 4.05,
      marginMdMm: 3.85,
      maxMarginBlMm: 4.45,
      maxMarginMdMm: 4.25,
      topLabialHalfMm: 0.94,
      topLingualHalfMm: 0.66,
      topMdMm: 2.65,
      defaultPostHeightMm: 6.9,
      lingualTopDropMm: 0.28,
    },
  },
  {
    toothClass: "L2",
    jaw: "lower",
    position: 2,
    kind: "incisor",
    koreanName: "하악 측절치",
    crown: {
      cervical: { mdMm: 4.1, blMm: 5.5 },
      equator: { mdMm: 5.8, blMm: 6.2, labialCrestRatio: 0.26, lingualCrestRatio: 0.24 },
      occlusal: { mdMm: 5.5, blMm: 3.8 },
      clinicalHeightMm: 9.1,
    },
    morphology: {
      sectionShape: "labial_arc_ovoid",
      maxMdLabialShiftRatio: 0.23,
      labialExponent: 1.68,
      lingualExponent: 1.26,
      lateralExponent: 1.52,
      cingulum: { hasCingulum: true, collarHeightRatio: 0.58, bevelAngleDeg: 30, lingualFossaDepthMm: 0.5 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.0,
      crownWallLingualMm: 1.0,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.6,
      marginBlMm: 4.25,
      marginMdMm: 4.15,
      maxMarginBlMm: 4.65,
      maxMarginMdMm: 4.55,
      topLabialHalfMm: 0.98,
      topLingualHalfMm: 0.68,
      topMdMm: 2.9,
      defaultPostHeightMm: 7.0,
      lingualTopDropMm: 0.28,
    },
  },
  {
    toothClass: "L3",
    jaw: "lower",
    position: 3,
    kind: "canine",
    koreanName: "하악 견치",
    crown: {
      cervical: { mdMm: 5.2, blMm: 6.5 },
      equator: { mdMm: 6.7, blMm: 7.3, labialCrestRatio: 0.28, lingualCrestRatio: 0.25 },
      occlusal: { mdMm: 5.9, blMm: 4.4 },
      clinicalHeightMm: 9.8,
    },
    morphology: {
      sectionShape: "rounded_inverted_triangle_diamond",
      maxMdLabialShiftRatio: 0.26,
      labialExponent: 1.34,
      lingualExponent: 1.18,
      lateralExponent: 1.4,
      cingulum: { hasCingulum: true, collarHeightRatio: 0.58, bevelAngleDeg: 32, lingualFossaDepthMm: 0.65 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.0,
      crownWallLingualMm: 1.0,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.7,
      marginBlMm: 4.85,
      marginMdMm: 4.65,
      maxMarginBlMm: 5.25,
      maxMarginMdMm: 5.05,
      topLabialHalfMm: 1.1,
      topLingualHalfMm: 0.72,
      topMdMm: 2.95,
      defaultPostHeightMm: 7.2,
      lingualTopDropMm: 0.35,
    },
  },
  {
    toothClass: "L4",
    jaw: "lower",
    position: 4,
    kind: "premolar",
    koreanName: "하악 제1소구치",
    crown: {
      cervical: { mdMm: 4.9, blMm: 6.7 },
      equator: { mdMm: 6.9, blMm: 7.7, labialCrestRatio: 0.35, lingualCrestRatio: 0.5 },
      occlusal: { mdMm: 6.3, blMm: 6.5 },
      clinicalHeightMm: 8.3,
    },
    morphology: {
      sectionShape: "ovoid_trapezoid",
      maxMdLabialShiftRatio: 0.14,
      labialExponent: 2.26,
      lingualExponent: 2.58,
      lateralExponent: 2.4,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 4.75,
      marginMdMm: 4.65,
      maxMarginBlMm: 5.15,
      maxMarginMdMm: 5.1,
      topLabialHalfMm: 1.9,
      topLingualHalfMm: 1.82,
      topMdMm: 3.45,
      defaultPostHeightMm: 5.9,
      lingualTopDropMm: 0.18,
    },
  },
  {
    toothClass: "L5",
    jaw: "lower",
    position: 5,
    kind: "premolar",
    koreanName: "하악 제2소구치",
    crown: {
      cervical: { mdMm: 5.1, blMm: 7.1 },
      equator: { mdMm: 7.1, blMm: 8.2, labialCrestRatio: 0.36, lingualCrestRatio: 0.5 },
      occlusal: { mdMm: 6.5, blMm: 7.0 },
      clinicalHeightMm: 8.0,
    },
    morphology: {
      sectionShape: "ovoid_trapezoid",
      maxMdLabialShiftRatio: 0.12,
      labialExponent: 2.28,
      lingualExponent: 2.55,
      lateralExponent: 2.4,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 5.15,
      marginMdMm: 4.75,
      maxMarginBlMm: 5.55,
      maxMarginMdMm: 5.25,
      topLabialHalfMm: 2.02,
      topLingualHalfMm: 1.94,
      topMdMm: 3.55,
      defaultPostHeightMm: 6.0,
      lingualTopDropMm: 0.18,
    },
  },
  {
    toothClass: "L6",
    jaw: "lower",
    position: 6,
    kind: "molar",
    koreanName: "하악 제1대구치",
    crown: {
      cervical: { mdMm: 8.7, blMm: 9.1 },
      equator: { mdMm: 10.9, blMm: 10.4, labialCrestRatio: 0.35, lingualCrestRatio: 0.5 },
      occlusal: { mdMm: 10.0, blMm: 9.0 },
      clinicalHeightMm: 7.5,
    },
    morphology: {
      sectionShape: "rounded_rect",
      maxMdLabialShiftRatio: 0.03,
      labialExponent: 3.15,
      lingualExponent: 3.15,
      lateralExponent: 3.15,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 6.45,
      marginMdMm: 6.65,
      maxMarginBlMm: 6.9,
      maxMarginMdMm: 7.1,
      topLabialHalfMm: 2.65,
      topLingualHalfMm: 2.65,
      topMdMm: 5.45,
      defaultPostHeightMm: 5.3,
      lingualTopDropMm: 0.12,
    },
  },
  {
    toothClass: "L7",
    jaw: "lower",
    position: 7,
    kind: "molar",
    koreanName: "하악 제2대구치",
    crown: {
      cervical: { mdMm: 8.2, blMm: 8.7 },
      equator: { mdMm: 10.2, blMm: 9.9, labialCrestRatio: 0.35, lingualCrestRatio: 0.5 },
      occlusal: { mdMm: 9.4, blMm: 8.6 },
      clinicalHeightMm: 7.2,
    },
    morphology: {
      sectionShape: "rounded_rect",
      maxMdLabialShiftRatio: 0.03,
      labialExponent: 3.15,
      lingualExponent: 3.15,
      lateralExponent: 3.15,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 6.2,
      marginMdMm: 6.35,
      maxMarginBlMm: 6.65,
      maxMarginMdMm: 6.8,
      topLabialHalfMm: 2.55,
      topLingualHalfMm: 2.55,
      topMdMm: 5.25,
      defaultPostHeightMm: 5.3,
      lingualTopDropMm: 0.12,
    },
  },
  {
    toothClass: "L8",
    jaw: "lower",
    position: 8,
    kind: "molar",
    koreanName: "하악 제3대구치",
    crown: {
      cervical: { mdMm: 7.8, blMm: 8.4 },
      equator: { mdMm: 9.7, blMm: 9.5, labialCrestRatio: 0.35, lingualCrestRatio: 0.5 },
      occlusal: { mdMm: 8.9, blMm: 8.3 },
      clinicalHeightMm: 6.9,
    },
    morphology: {
      sectionShape: "rounded_rect",
      maxMdLabialShiftRatio: 0.03,
      labialExponent: 3.05,
      lingualExponent: 3.05,
      lateralExponent: 3.05,
      cingulum: { hasCingulum: false, collarHeightRatio: 0, bevelAngleDeg: 0, lingualFossaDepthMm: 0 },
    },
    abutmentCutback: {
      crownWallLabialMm: 1.5,
      crownWallLingualMm: 1.5,
      crownWallProximalMm: 1.0,
      crownWallOcclusalMm: 1.2,
      marginBlMm: 6.0,
      marginMdMm: 6.1,
      maxMarginBlMm: 6.4,
      maxMarginMdMm: 6.5,
      topLabialHalfMm: 2.48,
      topLingualHalfMm: 2.48,
      topMdMm: 5.05,
      defaultPostHeightMm: 5.1,
      lingualTopDropMm: 0.12,
    },
  },
];

function buildDefaultMap(): Map<string, ToothAnatomySpec> {
  const map = new Map<string, ToothAnatomySpec>();
  for (const spec of DEFAULT_TOOTH_CLASS_SPECS) {
    const quads: ReadonlyArray<1 | 2 | 3 | 4> = spec.jaw === "upper" ? [1, 2] : [3, 4];
    for (const q of quads) {
      const fdi = `${q}${spec.position}`;
      map.set(fdi, {
        ...spec,
        toothNumber: fdi,
        quadrant: q,
      });
    }
  }
  return map;
}

const anatomyByFdi: Map<string, ToothAnatomySpec> = buildDefaultMap();
let hydratedOnce = false;
let hydratePromise: Promise<void> | null = null;

/** FDI 치아 번호(예: "33", "#33")의 부위별 정상 크기·해부 형태·커스텀어벗 기준치를 돌려준다. */
export function getToothAnatomy(toothNumber: string): ToothAnatomySpec {
  const digits = fdiToothDigits(toothNumber);
  return anatomyByFdi.get(digits) ?? anatomyByFdi.get("16")!;
}

/** 세션당 1회 백엔드 ToothAnatomy DB 카탈로그를 읽어 인메모리 기준표를 최신 상태로 맞춘다. */
export async function hydrateToothAnatomyCatalog(token?: string | null): Promise<void> {
  if (hydratedOnce || !token) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const res = await request<{ data?: { teeth?: ToothAnatomySpec[] } }>({
        path: "/api/ai/tooth-anatomy",
        method: "GET",
        token,
      });
      const teeth = res.data?.data?.teeth;
      if (res.ok && Array.isArray(teeth) && teeth.length > 0) {
        for (const row of teeth) {
          const rowVer = Number((row as { surveyMeta?: { version?: number } })?.surveyMeta?.version ?? 0);
          if (rowVer < TOOTH_ANATOMY_VERSION) continue;
          const digits = fdiToothDigits(row?.toothNumber || "");
          if (digits && row?.crown && row?.morphology && row?.abutmentCutback) {
            anatomyByFdi.set(digits, row);
          }
        }
        hydratedOnce = true;
      }
    } catch {
      // 오프라인·단위 테스트에서는 정적 SSOT 기준표를 그대로 사용한다.
    } finally {
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}
