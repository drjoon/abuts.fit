// related files:
// - web/frontend/src/shared/platform/platformBenefitsContent.ts
// - web/frontend/src/shared/components/practice/PracticeToothWorkGuideTourBanner.tsx
// - web/frontend/src/shared/guideTour/GuideTourProvider.tsx
// change-log:
// - 2026-09-05: oral_memo·oral_files — 날짜 다음·치식 전, 설명만(「다음」, 입력·업로드 불필요).
// - 2026-09-05: oral 임플란트·어벗 프리셋 기본 힌트 — 「+ 추가」저장 안내(상세는 resolve override).
// - 2026-09-05: oral_calendar — 도착일 클릭(action)으로 다음 스텝. 「다음」도 가능.
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
};

const PRACTICE_ORAL_PATH = "/dashboard/practice-transfers?mode=send";
const LAB_RECEIVE_PATH = "/dashboard/practice-transfers?mode=receive";
const CREDITS_PATH = "/dashboard/credits";
const NEW_REQUEST_PATH = "/dashboard/new-request";
const STORE_PATH = "/dashboard/store";

export const PRACTICE_GUIDE_TOUR_CHAPTER_TOTAL = 4;

const practiceOralActionSteps: GuideTourStepDef[] =
  PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.map((s) => ({
    id: `oral_${s.id}`,
    title: s.title,
    hint: s.hint,
    path: PRACTICE_ORAL_PATH,
    target: `oral_${s.id}`,
    advance: "action" as const,
    chapter: 1,
    openCompose: true,
    oralSubStepId: s.id,
  }));

/** 기공소·환자·날짜 — 메모|파일 안내 앞 */
const ORAL_HEADER_SUB_STEP_IDS = new Set(["lab", "patient", "dates"]);
const practiceOralHeaderSteps = practiceOralActionSteps.filter((s) =>
  ORAL_HEADER_SUB_STEP_IDS.has(String(s.oralSubStepId || "")),
);
const practiceOralToothSteps = practiceOralActionSteps.filter(
  (s) => !ORAL_HEADER_SUB_STEP_IDS.has(String(s.oralSubStepId || "")),
);

/** 치과 — 시작 + 첨1~4 페이지 기준 4챕터 */
export const PRACTICE_GUIDE_TOUR_STEPS: readonly GuideTourStepDef[] = [
  {
    id: "intro",
    title: "가이드투어",
    hint: "어벗츠의 편리함을 경험해보세요.\n가이드투어를 시작합니다.",
    path: PRACTICE_ORAL_PATH,
    target: null,
    advance: "next",
  },
  // —— 챕터1: 구강스캔 기공의뢰 ——
  {
    id: "oral_calendar",
    title: "기공의뢰 캘린더",
    hint: "캘린더에서 기공물 도착 날짜를 클릭해 신규 의뢰를 시작합니다.",
    path: PRACTICE_ORAL_PATH,
    target: "oral_calendar",
    advance: "action",
    chapter: 1,
    openCompose: false,
  },
  ...practiceOralHeaderSteps,
  {
    id: "oral_memo",
    title: "메모",
    hint: "기공소에 전달할 메모를 여기에 적습니다. 투어에서는 입력하지 말고 「다음」으로 넘어가세요.",
    path: PRACTICE_ORAL_PATH,
    target: "oral_memo",
    advance: "next",
    chapter: 1,
    openCompose: true,
  },
  {
    id: "oral_files",
    title: "파일 첨부",
    hint: "STL·PLY 등 스캔·이미지 파일을 클릭하거나 드래그해 첨부합니다. 투어에서는 올리지 말고 「다음」으로 이어 가세요.",
    path: PRACTICE_ORAL_PATH,
    target: "oral_files",
    advance: "next",
    chapter: 1,
    openCompose: true,
  },
  ...practiceOralToothSteps,
  {
    id: "oral_send",
    title: "기공소로 전송",
    hint: "작성이 끝나면 「기공소로 전송」으로 보냅니다. 투어에서는 누르지 말고 「다음」으로 이어 가세요.",
    path: PRACTICE_ORAL_PATH,
    target: "oral_send",
    advance: "next",
    chapter: 1,
    openCompose: true,
  },
  {
    id: "oral_phone",
    title: "휴대폰 구강포토",
    hint: "휴대폰에서도 환자 사진을 찍어 올릴 수 있습니다. (투어용으로 폰 화면을 잠시 보여 드립니다.)",
    path: PRACTICE_ORAL_PATH,
    target: "oral_phone",
    advance: "next",
    chapter: 1,
    openCompose: true,
    forceMobile: true,
  },
  {
    id: "oral_drafts",
    title: "임시저장 · 휴지통",
    hint: "임시저장은 전송 전 이어서 작성할 때, 휴지통은 취소·삭제한 의뢰를 볼 때 씁니다.",
    path: PRACTICE_ORAL_PATH,
    target: "oral_drafts",
    advance: "next",
    chapter: 1,
    openCompose: false,
  },
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
    hint: "어벗·힐링·키트 등을 장바구니에 담아 주문합니다. 커스텀어벗·선수금과 별도입니다.\n투어를 마치면 사이드바의 가이드투어 버튼이 사라집니다.",
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
