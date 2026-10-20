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

export const NEW_IMPLANT_DEVELOPMENT_ACK_TITLE =
  "추가 개발이 필요한 임플란트입니다";

export const NEW_IMPLANT_DEVELOPMENT_ACK_BODY =
  "선택하신 임플란트는 지금은 CNC 생산이 불가합니다.";

export const NEW_IMPLANT_DEVELOPMENT_ACK_FOLLOWUP =
  "추가 개발을 요청 접수했습니다. 랩 아날로그와 기존 어벗 샘플을 보내주시면 검토 후 안내드립니다.";
