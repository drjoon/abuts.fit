// related files:
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// - web/frontend/src/shared/guideTour/guideTourAlwaysOn.ts
// - web/frontend/src/shared/guideTour/GuideTourSpotlight.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/users/user.controller.js
// - web/backend/utils/guideTour.util.js
// - web/frontend/src/shared/components/practice/PracticeToothWorkGuideTourBanner.tsx
// change-log:
// - 2026-09-05: 테스트치과·테스트기공소 — 가이드투어 수료 고정 금지(항시 eligible).
// - 2026-09-05: lab — 챕터 progress·pause/수료 수신 랜딩·레거시 normalize.
// - 2026-09-05: pause(다음에 하기) — 치과는 구강스캔 빈 캘린더로 이동(중단 화면 잔류 방지).
// - 2026-09-05: 수료(complete) — intro형 안내·확인 시 구강스캔 포워딩.
// - 2026-09-05: custom_abut 시네마 3장 → 1장. 레거시 implant/scanbody/simple resume → oral_custom_abut.
// - 2026-09-05: custom_abut 시네마 3장. 레거시 oral_custom_abut resume 정규화.
// - 2026-09-05: 치과 Spotlight — 전체 프로세스 N/…(챕터·구강 카운터).
// - 2026-09-05: oral_estimate — allowTargetInteraction(견적 호버·툴팁).
// - 2026-09-05: 구강 영화형 — Spotlight progress · allowTargetInteraction(card_ops).
// - 2026-09-05: oral 프리셋 스텝 — IntakePanel이 Spotlight 문구 override(미설정 「+ 추가」안내).
// - 2026-09-05: oral action 스텝도「다음」상시 표시.
// - 2026-09-05: 챕터 카운터·건너뛰기·forceMobile. oral 치식 체험 유지.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS } from "@/shared/components/practice/PracticeToothWorkGuideTourBanner";
import {
  getGuideTourStepIndex,
  getGuideTourSteps,
  getLabGuideTourProcessProgress,
  getPracticeGuideTourProcessProgress,
  isGuideTourAllowTargetInteraction,
  isPracticeToothWorkOralStepId,
  LAB_GUIDE_TOUR_CHAPTER_TOTAL,
  LAB_RECEIVE_PATH,
  normalizeLabGuideTourStepId,
  normalizePracticeGuideTourStepId,
  PRACTICE_GUIDE_TOUR_CHAPTER_TOTAL,
  PRACTICE_ORAL_PATH,
  type GuideTourKind,
  type GuideTourStepDef,
} from "@/shared/guideTour/guideTourSteps";
import { isGuideTourAlwaysOnBusiness } from "@/shared/guideTour/guideTourAlwaysOn";
import { GuideTourSpotlight } from "@/shared/guideTour/GuideTourSpotlight";

type GuideTourSpotlightCopyOverride = {
  title?: string;
  hint?: string;
} | null;

type GuideTourContextValue = {
  kind: GuideTourKind | null;
  eligible: boolean;
  completed: boolean;
  active: boolean;
  stepId: string | null;
  step: GuideTourStepDef | null;
  stepIndex: number;
  stepTotal: number;
  /** Spotlight 챕터 번호 (치과 1~4 · 기공소 1~3) */
  chapterDisplay: number;
  chapterTotal: number;
  forceMobile: boolean;
  resumeStepId: string | null;
  startOrResume: () => void;
  pause: () => void;
  advance: () => void;
  retreat: () => void;
  /** oral chapter: sync tooth-work substep index (0-based) */
  oralSubStepIndex: number | null;
  /** oral 프리셋 등 — IntakePanel이 빈 프리셋 안내로 Spotlight 문구를 덮어씀 */
  setSpotlightCopyOverride: (next: GuideTourSpotlightCopyOverride) => void;
};

const GuideTourContext = createContext<GuideTourContextValue | null>(null);

const emptyGuideTour: GuideTourContextValue = {
  kind: null,
  eligible: false,
  completed: true,
  active: false,
  stepId: null,
  step: null,
  stepIndex: 0,
  stepTotal: 0,
  chapterDisplay: 0,
  chapterTotal: 0,
  forceMobile: false,
  resumeStepId: null,
  startOrResume: () => {},
  pause: () => {},
  advance: () => {},
  retreat: () => {},
  oralSubStepIndex: null,
  setSpotlightCopyOverride: () => {},
};

export function useGuideTour(): GuideTourContextValue {
  const ctx = useContext(GuideTourContext);
  return ctx ?? emptyGuideTour;
}

async function persistGuideTour(body: {
  completed?: boolean;
  resumeStepId?: string | null;
}): Promise<{ completed: boolean; resumeStepId: string | null } | null> {
  try {
    const res = await apiFetch<{
      success?: boolean;
      data?: {
        guideTour?: { completed?: boolean; resumeStepId?: string | null };
      };
    }>({
      path: "/api/users/guide-tour",
      method: "PUT",
      jsonBody: body,
    });
    if (!res.ok) return null;
    const gt = res.data?.data?.guideTour;
    if (!gt) return null;
    return {
      completed: Boolean(gt.completed),
      resumeStepId:
        typeof gt.resumeStepId === "string" && gt.resumeStepId.trim()
          ? gt.resumeStepId.trim()
          : null,
    };
  } catch {
    return null;
  }
}

function pathMatches(
  stepPath: string | undefined,
  loc: { pathname: string; search: string },
) {
  if (!stepPath) return true;
  try {
    const u = new URL(stepPath, window.location.origin);
    if (u.pathname !== loc.pathname) return false;
    if (!u.search) return true;
    const want = new URLSearchParams(u.search);
    const have = new URLSearchParams(loc.search);
    for (const [k, v] of want.entries()) {
      if (have.get(k) !== v) return false;
    }
    return true;
  } catch {
    return loc.pathname + loc.search === stepPath;
  }
}

function practiceOralIndex(oralSubStepId: string): number {
  return PRACTICE_TOOTH_WORK_GUIDE_TOUR_STEPS.findIndex(
    (s) => s.id === oralSubStepId,
  );
}

type ProviderProps = {
  kind: GuideTourKind | null;
  children: ReactNode;
};

export function GuideTourProvider({ kind, children }: ProviderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const setGuideTour = useAuthStore((s) => s.setGuideTour);

  const alwaysOn = isGuideTourAlwaysOnBusiness(user?.companyName);
  const completed = alwaysOn
    ? false
    : Boolean(user?.guideTour?.completed);
  const resumeStepId = user?.guideTour?.resumeStepId ?? null;
  const eligible =
    Boolean(kind) &&
    user?.role === "requestor" &&
    (kind === "practice" || kind === "lab") &&
    !completed;

  const steps = useMemo(
    () => (kind ? getGuideTourSteps(kind) : []),
    [kind],
  );

  const [active, setActive] = useState(false);
  const [stepId, setStepId] = useState<string | null>(null);
  const [spotlightCopyOverride, setSpotlightCopyOverride] =
    useState<GuideTourSpotlightCopyOverride>(null);
  const autoStartedRef = useRef(false);
  const persistSeq = useRef(0);

  const stepIndex = kind ? getGuideTourStepIndex(kind, stepId) : 0;
  const step = steps[stepIndex] ?? null;
  const stepTotal = steps.length;

  const usesChapterSteps = kind === "practice" || kind === "lab";
  const chapterDisplay =
    usesChapterSteps && step?.chapter != null
      ? step.chapter
      : stepIndex + 1;
  const chapterTotal =
    kind === "practice"
      ? PRACTICE_GUIDE_TOUR_CHAPTER_TOTAL
      : kind === "lab"
        ? LAB_GUIDE_TOUR_CHAPTER_TOTAL
        : Math.max(stepTotal, 1);
  /** intro/complete 등 — 챕터 번호 없이 제목만 */
  const showChapterProgress =
    !usesChapterSteps || step?.chapter != null;
  const forceMobile = Boolean(active && step?.forceMobile);

  const homePath =
    kind === "practice"
      ? PRACTICE_ORAL_PATH
      : kind === "lab"
        ? LAB_RECEIVE_PATH
        : null;

  const applyLocalGuideTour = useCallback(
    (next: { completed: boolean; resumeStepId: string | null }) => {
      setGuideTour(next);
    },
    [setGuideTour],
  );

  const persist = useCallback(
    async (body: { completed?: boolean; resumeStepId?: string | null }) => {
      const seq = ++persistSeq.current;
      const saved = await persistGuideTour(body);
      if (!saved || seq !== persistSeq.current) return;
      applyLocalGuideTour(saved);
    },
    [applyLocalGuideTour],
  );

  const goToStep = useCallback(
    (id: string) => {
      setSpotlightCopyOverride(null);
      setStepId(id);
      setActive(true);
      const def = steps.find((s) => s.id === id);
      if (def?.path && !pathMatches(def.path, location)) {
        navigate(def.path);
      }
      void persist({ resumeStepId: id });
    },
    [steps, location, navigate, persist],
  );

  const startOrResume = useCallback(() => {
    if (!kind || completed) return;
    const raw = resumeStepId || steps[0]?.id;
    const id =
      kind === "practice"
        ? normalizePracticeGuideTourStepId(raw) ?? raw
        : kind === "lab"
          ? normalizeLabGuideTourStepId(raw) ?? raw
          : raw;
    if (!id) return;
    goToStep(id);
  }, [kind, completed, resumeStepId, steps, goToStep]);

  const pause = useCallback(() => {
    if (!stepId) {
      setActive(false);
      if (homePath) navigate(homePath);
      return;
    }
    void persist({ resumeStepId: stepId });
    setActive(false);
    // 중단 화면(상세·프리필)에 남지 않게 — 수료와 같이 홈(수신/구강)으로
    if (homePath) navigate(homePath);
  }, [stepId, persist, homePath, navigate]);

  const advance = useCallback(() => {
    if (!kind || !step) return;
    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      setActive(false);
      setStepId(null);
      // 테스트치과·테스트기공소는 수료 고정 금지 → 사이드바·재진입 유지
      applyLocalGuideTour({
        completed: alwaysOn ? false : true,
        resumeStepId: null,
      });
      void persist({
        completed: alwaysOn ? false : true,
        resumeStepId: null,
      });
      if (homePath) navigate(homePath);
      return;
    }
    const next = steps[nextIdx];
    if (!next) return;
    goToStep(next.id);
  }, [
    kind,
    step,
    stepIndex,
    steps,
    goToStep,
    persist,
    applyLocalGuideTour,
    navigate,
    homePath,
    alwaysOn,
  ]);

  const retreat = useCallback(() => {
    if (!kind || !step) return;
    if (stepIndex <= 0) return;
    const prev = steps[stepIndex - 1];
    if (!prev) return;
    goToStep(prev.id);
  }, [kind, step, stepIndex, steps, goToStep]);

  // 첫 진입 자동 시작: 미수료 + resume 없음
  useEffect(() => {
    if (!eligible || !kind) return;
    if (autoStartedRef.current) return;
    if (resumeStepId) return;
    if (active) return;
    autoStartedRef.current = true;
    const first = steps[0]?.id;
    if (!first) return;
    goToStep(first);
  }, [eligible, kind, resumeStepId, active, steps, goToStep]);

  // 스텝 path로 맞추기 (resume 후 페이지 로드)
  useEffect(() => {
    if (!active || !step?.path) return;
    if (pathMatches(step.path, location)) return;
    navigate(step.path);
  }, [active, step?.path, location, navigate]);

  const oralSubStepIndex = useMemo(() => {
    if (
      !step ||
      !isPracticeToothWorkOralStepId(step.id) ||
      !step.oralSubStepId
    ) {
      return null;
    }
    const idx = practiceOralIndex(step.oralSubStepId);
    return idx >= 0 ? idx : null;
  }, [step]);

  const value: GuideTourContextValue = {
    kind,
    eligible,
    completed,
    active,
    stepId,
    step,
    stepIndex,
    stepTotal,
    chapterDisplay,
    chapterTotal,
    forceMobile,
    resumeStepId,
    startOrResume,
    pause,
    advance,
    retreat,
    oralSubStepIndex,
    setSpotlightCopyOverride,
  };

  const showCoach = active && step;
  const isLastStep = stepIndex >= stepTotal - 1;
  const spotlightTitle = spotlightCopyOverride?.title ?? step?.title ?? "";
  const spotlightHint = spotlightCopyOverride?.hint ?? step?.hint ?? "";
  const processProgress =
    kind === "practice"
      ? getPracticeGuideTourProcessProgress(stepId)
      : kind === "lab"
        ? getLabGuideTourProcessProgress(stepId)
        : null;
  const spotlightStepIndex = processProgress
    ? processProgress.index
    : showChapterProgress
      ? chapterDisplay - 1
      : 0;
  const spotlightStepTotal = processProgress
    ? processProgress.total
    : showChapterProgress
      ? chapterTotal
      : 0;

  return (
    <GuideTourContext.Provider value={value}>
      {children}
      {showCoach ? (
        <GuideTourSpotlight
          stepIndex={spotlightStepIndex}
          stepTotal={spotlightStepTotal}
          title={spotlightTitle}
          hint={spotlightHint}
          target={step.target}
          showBack={stepIndex > 0}
          showNext
          showSkip={Boolean(step.skippable)}
          allowTargetInteraction={isGuideTourAllowTargetInteraction(step)}
          nextLabel={
            step.id === "intro"
              ? "계속"
              : step.id === "complete"
                ? "확인"
                : isLastStep
                  ? "완료"
                  : "다음"
          }
          onBack={retreat}
          onNext={advance}
          onSkip={advance}
          onPause={pause}
        />
      ) : null}
    </GuideTourContext.Provider>
  );
}
