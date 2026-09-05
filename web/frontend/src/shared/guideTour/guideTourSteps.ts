// related files:
// - web/frontend/src/shared/platform/platformBenefitsContent.ts
// - web/frontend/src/shared/components/practice/PracticeToothWorkGuideTourBanner.tsx
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx

import { PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS } from "@/shared/components/practice/PracticeToothWorkGuideTourBanner";

export type GuideTourKind = "practice" | "lab";

export type GuideTourAdvanceMode = "next" | "action";

export type GuideTourStepDef = {
  id: string;
  title: string;
  hint: string;
  /** navigate target; omit for overlay-only (stay on current route) */
  path?: string;
  /** data-guide-tour target; null = centered card without hole */
  target?: string | null;
  advance: GuideTourAdvanceMode;
  /** maps to oral-scan tooth-work step id when on compose */
  oralSubStepId?: (typeof PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS)[number]["id"];
};

const PRACTICE_ORAL_PATH = "/dashboard/practice-transfers?mode=send";
const LAB_RECEIVE_PATH = "/dashboard/practice-transfers?mode=receive";
const CREDITS_PATH = "/dashboard/credits";
const NEW_REQUEST_PATH = "/dashboard/new-request";

const practiceOralSteps: GuideTourStepDef[] =
  PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.map((s) => ({
    id: `oral_${s.id}`,
    title: s.title,
    hint: s.hint,
    path: PRACTICE_ORAL_PATH,
    target: `oral_${s.id}`,
    advance: "action" as const,
    oralSubStepId: s.id,
  }));

/** 치과 — 플랫폼 장점(가입 이유) 페이지 투어 */
export const PRACTICE_GUIDE_TOUR_STEPS: readonly GuideTourStepDef[] = [
  {
    id: "intro",
    title: "가이드투어",
    hint: "전자 기공의뢰서·대금정산 및 통계·계산서 자동발급·스토어 쇼핑·커스텀어벗 제작까지!\n각 화면을 직접 눌러 보며 익혀 보세요.",
    target: null,
    advance: "next",
  },
  ...practiceOralSteps,
  {
    id: "credits",
    title: "정산·계산서는 맡기세요",
    hint: "크레딧 잔고와 기공비·어벗 의뢰비 내역을 확인합니다. 결제·사용 내역과 계산서도 여기서 관리합니다.",
    path: CREDITS_PATH,
    target: "credits_workspace",
    advance: "next",
  },
  {
    id: "abutment",
    title: "커스텀 어벗 디자인",
    hint: "디자인하신 어벗 STL을 올리면 CNC 어벗을 생산해 드립니다. 가입 후 첫 2건은 무료 테스트입니다.",
    path: NEW_REQUEST_PATH,
    target: "new_request_workspace",
    advance: "next",
  },
  {
    id: "wrap",
    title: "계속 업데이트합니다",
    hint: "문의·채팅으로 의견을 보내 주세요. 함께 맞춰 가겠습니다. 투어를 마치면 사이드바의 가이드투어 버튼이 사라집니다.",
    target: null,
    advance: "next",
  },
] as const;

/** 기공소 — 플랫폼 장점(왜 가입할까요?) 페이지 투어 */
export const LAB_GUIDE_TOUR_STEPS: readonly GuideTourStepDef[] = [
  {
    id: "intro",
    title: "가이드투어",
    hint: "이메일·정산·커스텀어벗 생산까지, 기공소 업무를 한곳에서 이어줍니다. 관련 화면을 하나씩 살펴봅니다.",
    target: null,
    advance: "next",
  },
  {
    id: "receive",
    title: "이제 이메일 쓰지 마세요",
    hint: "치과로부터 기공의뢰·구강스캔을 받고, 지난 내역과 건별 채팅을 한곳에서 관리합니다.",
    path: LAB_RECEIVE_PATH,
    target: "lab_receive_workspace",
    advance: "next",
  },
  {
    id: "credits",
    title: "정산·계산서는 맡기세요",
    hint: "입출금·크레딧·소비 내역을 플랫폼이 관리하고, 매달 정산과 계산서 발행까지 처리합니다.",
    path: CREDITS_PATH,
    target: "credits_workspace",
    advance: "next",
  },
  {
    id: "abutment_order",
    title: "커스텀어벗 생산도 맡겨주세요",
    hint: "어벗츠로 CNC 커스텀어벗을 의뢰할 수 있습니다. 가입 후 첫 2건은 무료 테스트입니다.",
    path: NEW_REQUEST_PATH,
    target: "new_request_workspace",
    advance: "next",
  },
  {
    id: "wrap",
    title: "계속 업데이트합니다",
    hint: "문의·채팅으로 기공소 의견을 듣습니다. 투어를 마치면 사이드바의 가이드투어 버튼이 사라집니다.",
    target: null,
    advance: "next",
  },
] as const;

export const getGuideTourSteps = (
  kind: GuideTourKind,
): readonly GuideTourStepDef[] =>
  kind === "lab" ? LAB_GUIDE_TOUR_STEPS : PRACTICE_GUIDE_TOUR_STEPS;

export const getGuideTourStepIndex = (
  kind: GuideTourKind,
  stepId: string | null | undefined,
): number => {
  if (!stepId) return 0;
  const steps = getGuideTourSteps(kind);
  const idx = steps.findIndex((s) => s.id === stepId);
  return idx >= 0 ? idx : 0;
};

export const isOralGuideTourStepId = (stepId: string | null | undefined): boolean =>
  Boolean(stepId && stepId.startsWith("oral_"));
