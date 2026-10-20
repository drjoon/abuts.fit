/** 3D 확인 — 「찾으시는 임플란트가 없나요?」 빠른 입력 */
export type NewImplantQuickPreset = {
  label: string;
  manufacturer: string;
  brand: string;
  family: string;
};

export const NEW_IMPLANT_QUICK_PRESETS: NewImplantQuickPreset[] = [
  {
    label: "애크로덴트",
    manufacturer: "(주)애크로덴트",
    brand: "Simple",
    family: "Regular",
  },
  {
    label: "더심플",
    manufacturer: "The Simple",
    brand: "Implant",
    family: "Regular",
  },
  {
    label: "레귤러",
    manufacturer: "미분류",
    brand: "Regular",
    family: "Regular",
  },
];

export const NEW_IMPLANT_DEVELOPMENT_ACK_TITLE = "추가 개발 임플란트";

export const NEW_IMPLANT_DEVELOPMENT_ACK_CNC =
  "아직 CNC 생산이 안됩니다.";

export const NEW_IMPLANT_DEVELOPMENT_ACK_BENEFIT =
  "랩 아날로그·어벗 샘플을 보내주시면 무료 크레딧을 드립니다.";

/** 혜택 문장 강조 */
export const NEW_IMPLANT_DEVELOPMENT_ACK_CREDIT = "무료 크레딧";

export const NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP =
  "관리자가 확인 후 연락드립니다.";

/** 의뢰 payload·관리자 열람용 기본 메모 */
export const NEW_IMPLANT_DEVELOPMENT_REQUEST_MESSAGE =
  "랩 아날로그·어벗 샘플 제공 시 무료 크레딧 지급";

/** 3D 확인 「?」 툴팁 */
export const NEW_IMPLANT_DEVELOPMENT_ENTRY_HINT_MESSAGES = [
  NEW_IMPLANT_DEVELOPMENT_ACK_CNC,
  NEW_IMPLANT_DEVELOPMENT_ACK_BENEFIT,
  NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP,
] as const;
