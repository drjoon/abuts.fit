// related files:
// - web/frontend/src/shared/platform/platformBenefitsContent.ts
// - web/frontend/src/shared/components/practice/PracticeToothWorkGuideTourBanner.tsx
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// change-log:
// - 2026-09-05: intro 다음 oral_calendar — 사이드바「구강스캔으로」+ 캘린더 작업영역(작성 패널 전).
// - 2026-09-05: 시작(intro) 힌트 — 강제 줄바꿈 제거(코치마크 1줄 폭).
// - 2026-09-05: 구강 챕터 9장 영화형(이전/다음). calendar·세분 스텝 제거. 4·5번만 조작 허용.
// - 2026-09-05: oral_memo·oral_files — 날짜 다음·치식 전, 설명만(「다음」, 입력·업로드 불필요).
// - 2026-09-05: 치과 투어 4챕터. 챕터 카운터 1/4·치식/어벗 체험 유지·전송·폰모드·임시저장.
// - 2026-09-05: 시작(intro) 스텝 분리 — 챕터 번호 없이「계속」.

import { PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS } from "@/shared/components/practice/PracticeToothWorkGuideTourBanner";

export type GuideTourKind = "practice" | "lab";

export type GuideTourAdvanceMode = "next" | "action";

export type GuideTourCreditsTab = "ledger" | "stats" | "charge";

export type GuideTourStepDef = {
  id: string;
  title: string;
  hint: string;
  /** navigate target; omit for overlay-only (stay on current route) */
  path?: string;
  /** data-guide-tour target; null = centered card without hole */
  target?: string | null;
  advance: GuideTourAdvanceMode;
  /** 진행 표시용 챕터(치과 1~4). 없으면 stepIndex+1 / stepTotal */
  chapter?: number;
  /** 챕터3 등 — Spotlight「건너뛰기」 */
  skippable?: boolean;
  /** 구강포토 안내용 모바일 레이아웃 강제 */
  forceMobile?: boolean;
  /** 정산 탭 동기화 */
  creditsTab?: GuideTourCreditsTab;
  /** maps to oral-scan tooth-work step id when on compose */
  oralSubStepId?: (typeof PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS)[number]["id"];
  /** 작성 패널(compose) 오픈 */
  openCompose?: boolean;
  /** 하이라이트 홀 안 클릭 허용(보철물 카드·커스텀어벗 체험) */
  allowTargetInteraction?: boolean;
};

const PRACTICE_ORAL_PATH = "/dashboard/practice-transfers?mode=send";
const LAB_RECEIVE_PATH = "/dashboard/practice-transfers?mode=receive";
const CREDITS_PATH = "/dashboard/credits";
const NEW_REQUEST_PATH = "/dashboard/new-request";
const STORE_PATH = "/dashboard/store";

export const PRACTICE_GUIDE_TOUR_CHAPTER_TOTAL = 4;

/** 구강 챕터 9장 — Spotlight 1/9…9/9 */
export const PRACTICE_ORAL_GUIDE_TOUR_STEP_IDS = [
  "oral_header",
  "oral_memo_files",
  "oral_prosthesis",
  "oral_card_ops",
  "oral_custom_abut",
  "oral_estimate",
  "oral_send",
  "oral_phone",
  "oral_drafts",
] as const;

export const PRACTICE_ORAL_GUIDE_TOUR_STEP_TOTAL =
  PRACTICE_ORAL_GUIDE_TOUR_STEP_IDS.length;

const practiceOralMovieSteps: GuideTourStepDef[] =
  PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.map((s) => {
    const id = `oral_${s.id}` as (typeof PRACTICE_ORAL_GUIDE_TOUR_STEP_IDS)[number];
    const allowTargetInteraction =
      s.id === "card_ops" || s.id === "custom_abut";
    const openCompose = s.id !== "drafts";
    const forceMobile = s.id === "phone";
    return {
      id,
      title: s.title,
      hint: s.hint,
      path: PRACTICE_ORAL_PATH,
      target: id,
      advance: "next" as const,
      chapter: 1,
      openCompose,
      forceMobile: forceMobile || undefined,
      allowTargetInteraction: allowTargetInteraction || undefined,
      oralSubStepId: s.id,
    };
  });

/** 치과 — 시작 + 첨1~4 페이지 기준 4챕터 */
export const PRACTICE_GUIDE_TOUR_STEPS: readonly GuideTourStepDef[] = [
  {
    id: "intro",
    title: "가이드투어",
    hint: "어벗츠의 편리함을 경험해보세요. 가이드투어를 시작합니다.",
    path: PRACTICE_ORAL_PATH,
    target: null,
    advance: "next",
  },
  // —— 챕터1: 사이드바·캘린더(작성 패널 열기 전) ——
  {
    id: "oral_calendar",
    title: "기공의뢰 · 구강스캔",
    hint: "왼쪽 「기공의뢰 → 구강스캔으로」가 이 화면입니다. 캘린더에서 의뢰 현황을 보고, 미래 날짜를 누르면 신규 의뢰를 작성합니다.",
    path: PRACTICE_ORAL_PATH,
    target: "oral_calendar",
    advance: "next",
    chapter: 1,
    // 작성 패널(compose)은 열지 않음 — 다음 oral_* 영화형에서 openCompose
  },
  // —— 챕터1: 구강스캔 기공의뢰 (9장 영화형) ——
  ...practiceOralMovieSteps,
  // —— 챕터2: 정산 ——
  {
    id: "credits_ledger",
    title: "정산 · 내역",
    hint: "잔액·충전·소비와 거래 내역을 확인합니다. 카드·필터로 상세를 볼 수 있습니다.",
    path: `${CREDITS_PATH}?tab=ledger`,
    target: "credits_workspace",
    advance: "next",
    chapter: 2,
    creditsTab: "ledger",
  },
  {
    id: "credits_stats",
    title: "정산 · 통계",
    hint: "기간별 충전·소비·의뢰 건수를 한눈에 봅니다.",
    path: `${CREDITS_PATH}?tab=stats`,
    target: "credits_workspace",
    advance: "next",
    chapter: 2,
    creditsTab: "stats",
  },
  {
    id: "credits_charge",
    title: "정산 · 충전",
    hint: "유료 크레딧을 충전하는 화면입니다. 기공비·스토어 결제에 사용합니다.",
    path: `${CREDITS_PATH}?tab=charge`,
    target: "credits_workspace",
    advance: "next",
    chapter: 2,
    creditsTab: "charge",
  },
  // —— 챕터3: 커스텀어벗 (건너뛰기 가능) ——
  {
    id: "abutment",
    title: "커스텀어벗 CNC",
    hint: "치과 내 기공실장님이 계시면, 커스텀어벗을 디자인한 뒤 STL을 올려 CNC 생산을 의뢰할 수 있습니다. 가입 후 첫 2건은 무료 테스트입니다.",
    path: NEW_REQUEST_PATH,
    target: "new_request_workspace",
    advance: "next",
    chapter: 3,
    skippable: true,
  },
  // —— 챕터4: 스토어 ——
  {
    id: "store",
    title: "스토어",
    hint: "어벗·힐링·키트 등을 장바구니에 담아 주문합니다. 커스텀어벗·선수금과 별도입니다. 투어를 마치면 사이드바의 가이드투어 버튼이 사라집니다.",
    path: STORE_PATH,
    target: "store_workspace",
    advance: "next",
    chapter: 4,
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

/** 챕터1에서 작성 패널을 열어야 하는 세부 */
export const shouldOpenComposeForGuideTourStep = (
  step: GuideTourStepDef | null | undefined,
): boolean => Boolean(step?.openCompose);

export const isPracticeToothWorkOralStepId = (
  stepId: string | null | undefined,
): boolean => {
  if (!stepId || !stepId.startsWith("oral_")) return false;
  const sub = stepId.slice("oral_".length);
  return PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.some((s) => s.id === sub);
};

export const getPracticeOralGuideTourProgress = (
  stepId: string | null | undefined,
): { index: number; total: number } | null => {
  if (!stepId) return null;
  const idx = (PRACTICE_ORAL_GUIDE_TOUR_STEP_IDS as readonly string[]).indexOf(
    stepId,
  );
  if (idx < 0) return null;
  return { index: idx, total: PRACTICE_ORAL_GUIDE_TOUR_STEP_TOTAL };
};

export const isGuideTourAllowTargetInteraction = (
  step: GuideTourStepDef | null | undefined,
): boolean => Boolean(step?.allowTargetInteraction);
