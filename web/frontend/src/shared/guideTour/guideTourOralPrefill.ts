// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-05: ensureGuideTourCustomAbutCrown — CA 없으면 16→15→14 크라운+CA 주입.
// - 2026-09-05: 커스텀어벗 투어 기본 어벗=심플어벗 8·M (GUIDE_TOUR_DEMO_SIMPLE_ABUTMENT).
// - 2026-09-05: 커스텀어벗 시네마용 임플란트·스캔바디 데모 프리셋.
// - 2026-09-05: 표시 용량 10·10·4MB. draft 파일명 식별(promote 누수 정리용).
// - 2026-09-05: 구강 챕터 영화형 — 환자·메모·치식·표시용 PLY 프리필(실업로드 스킵).

import type {
  PracticeAbutmentFavorite,
  PracticeImplantFavorite,
  ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { isCustomAbutmentProsthesisType } from "@/shared/practice/transferMemo";

export const GUIDE_TOUR_DEMO_PATIENT_NAME = "테스트환자";
export const GUIDE_TOUR_DEMO_MEMO = "쉐이드 포토 첨부";
export const GUIDE_TOUR_DEMO_ARRIVAL_OFFSET_DAYS = 7;

/** File.lastModified 마커 — preUpload·실전송에서 가이드 데모로 식별 */
export const GUIDE_TOUR_DEMO_FILE_LAST_MODIFIED = 1_700_000_000_000;

export type GuideTourDemoFileSpec = {
  name: string;
  /** UI 표시용 바이트(실제 Blob은 1바이트) */
  displaySize: number;
};

export const GUIDE_TOUR_DEMO_FILE_SPECS: readonly GuideTourDemoFileSpec[] = [
  { name: "UpperJaw.ply", displaySize: 10 * 1024 * 1024 },
  { name: "LowerJaw.ply", displaySize: 10 * 1024 * 1024 },
  { name: "Bitescan.ply", displaySize: 4 * 1024 * 1024 },
] as const;

/** 커스텀어벗 투어 — 어벗 쪽 기본(심플어벗 8 · M) */
export const GUIDE_TOUR_DEMO_SIMPLE_ABUTMENT = {
  abutmentManufacturer: "심플어벗",
  abutmentDiameter: "8",
  abutmentHeight: "M",
} as const;

const simpleAbut = {
  customAbutment: true as const,
  ...GUIDE_TOUR_DEMO_SIMPLE_ABUTMENT,
};

/** 커스텀어벗 체험 — 임플란트 임시 프리셋(오스템 TS3 · 덴티움 Superline) */
export const GUIDE_TOUR_DEMO_IMPLANT_FAVORITES: PracticeImplantFavorite[] = [
  {
    id: "guide-tour-implant-osstem-ts3",
    manufacturer: "오스템",
    brand: "TS3",
    family: "Regular",
    type: "Hex",
    adopted: true,
    adoptedKind: "cnc",
  },
  {
    id: "guide-tour-implant-dentium-superline",
    manufacturer: "덴티움",
    brand: "Superline",
    family: "Regular",
    type: "Hex",
    adopted: true,
    adoptedKind: "cnc",
  },
];

/** 커스텀어벗 체험 — 스캔바디 임시 프리셋(지오메디 4.5 × 5·7·9) */
export const GUIDE_TOUR_DEMO_ABUTMENT_FAVORITES: PracticeAbutmentFavorite[] = [
  {
    id: "guide-tour-sb-geomedi-5",
    manufacturer: "지오메디",
    diameter: "4.5",
    height: "5",
  },
  {
    id: "guide-tour-sb-geomedi-7",
    manufacturer: "지오메디",
    diameter: "4.5",
    height: "7",
  },
  {
    id: "guide-tour-sb-geomedi-9",
    manufacturer: "지오메디",
    diameter: "4.5",
    height: "9",
  },
];

/** 커스텀어벗 스텝 — CA 보철 없을 때 주입 후보(빈 치아만) */
export const GUIDE_TOUR_CUSTOM_ABUT_INJECT_TEETH = ["16", "15", "14"] as const;

export const toothWorkHasGuideTourCustomAbutment = (
  row: Pick<ToothWorkSelection, "customAbutment" | "prosthesisType">,
): boolean =>
  Boolean(row.customAbutment) ||
  isCustomAbutmentProsthesisType(String(row.prosthesisType || ""));

/**
 * 커스텀어벗 체험용 — CA 포함 보철이 없으면 16→15→14 중 빈 치아에 크라운+CA 1개 추가.
 * 이미 차지한 치아는 건너뜀(다른 보철로 선택된 경우).
 */
export const ensureGuideTourCustomAbutCrown = (
  toothWorks: ToothWorkSelection[],
): ToothWorkSelection[] => {
  if (toothWorks.some(toothWorkHasGuideTourCustomAbutment)) return toothWorks;
  const occupied = new Set(
    toothWorks
      .map((row) => String(row.toothNumber || "").trim())
      .filter(Boolean),
  );
  const tooth = GUIDE_TOUR_CUSTOM_ABUT_INJECT_TEETH.find((t) => !occupied.has(t));
  if (!tooth) return toothWorks;
  return [
    ...toothWorks,
    {
      toothNumber: tooth,
      prosthesisType: "크라운",
      customAbutment: true,
      bridgeLinkedTeeth: [],
      ...GUIDE_TOUR_DEMO_SIMPLE_ABUTMENT,
    },
  ];
};

/** 16–14 브리지+심플어벗, 13 크라운+CA, 12–22 임시치아 */
export const buildGuideTourDemoToothWorks = (): ToothWorkSelection[] => {
  const bridgeTeeth = ["16", "15", "14"] as const;
  const bridgeRows: ToothWorkSelection[] = bridgeTeeth.map((tooth) => {
    const others = bridgeTeeth.filter((t) => t !== tooth);
    const isAbut = tooth === "16" || tooth === "14";
    return {
      toothNumber: tooth,
      prosthesisType: "브리지",
      bridgeLinkedTeeth: [...others],
      ...(isAbut
        ? { ...simpleAbut }
        : {
            customAbutment: false,
            abutmentManufacturer: "",
            abutmentDiameter: "",
            abutmentHeight: "",
          }),
    };
  });

  const crown13: ToothWorkSelection = {
    toothNumber: "13",
    prosthesisType: "크라운",
    customAbutment: true,
    bridgeLinkedTeeth: [],
    ...GUIDE_TOUR_DEMO_SIMPLE_ABUTMENT,
  };

  const tempTeeth = ["12", "11", "21", "22"] as const;
  const tempRows: ToothWorkSelection[] = tempTeeth.map((tooth) => {
    const others = tempTeeth.filter((t) => t !== tooth);
    return {
      toothNumber: tooth,
      prosthesisType: "임시치아",
      customAbutment: false,
      bridgeLinkedTeeth: [...others],
    };
  });

  return [...bridgeRows, crown13, ...tempRows];
};

export const isGuideTourDemoFileName = (name: string | null | undefined): boolean => {
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  return GUIDE_TOUR_DEMO_FILE_SPECS.some((spec) => spec.name === trimmed);
};

/** promote 누수로 draft에 남은 1B 플레이스홀더 */
export const isLeakedGuideTourDemoDraft = (row: {
  originalName?: string | null;
  size?: number | null;
}): boolean =>
  isGuideTourDemoFileName(row.originalName) && Number(row.size || 0) <= 1;

export const isGuideTourDemoFile = (file: File | null | undefined): boolean => {
  if (!file) return false;
  if (file.lastModified === GUIDE_TOUR_DEMO_FILE_LAST_MODIFIED) return true;
  return isGuideTourDemoFileName(file.name);
};

export const guideTourDemoDisplaySize = (file: File): number => {
  const spec = GUIDE_TOUR_DEMO_FILE_SPECS.find((row) => row.name === file.name);
  return spec?.displaySize ?? Number(file.size || 0);
};

/** 표시용 1바이트 placeholder — 사이즈는 UI에서 displaySize로 덮어씀 */
export const createGuideTourDemoFiles = (): File[] =>
  GUIDE_TOUR_DEMO_FILE_SPECS.map(
    (spec) =>
      new File([new Uint8Array([0])], spec.name, {
        type: "application/octet-stream",
        lastModified: GUIDE_TOUR_DEMO_FILE_LAST_MODIFIED,
      }),
  );
