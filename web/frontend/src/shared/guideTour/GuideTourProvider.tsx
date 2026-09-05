// related files:
// - web/frontend/src/shared/guideTour/guideTourSteps.ts
// - web/frontend/src/shared/guideTour/GuideTourSpotlight.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/users/user.controller.js
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
  isOralGuideTourStepId,
  type GuideTourKind,
  type GuideTourStepDef,
} from "@/shared/guideTour/guideTourSteps";
import { GuideTourSpotlight } from "@/shared/guideTour/GuideTourSpotlight";

type GuideTourContextValue = {
  kind: GuideTourKind | null;
  eligible: boolean;
  completed: boolean;
  active: boolean;
  stepId: string | null;
  step: GuideTourStepDef | null;
  stepIndex: number;
  stepTotal: number;
  resumeStepId: string | null;
  startOrResume: () => void;
  pause: () => void;
  advance: () => void;
  /** oral chapter: sync tooth-work substep index (0-based) */
  oralSubStepIndex: number | null;
};

const GuideTourContext = createContext<GuideTourContextValue | null>(null);

export function useGuideTour(): GuideTourContextValue {
  const ctx = useContext(GuideTourContext);
  if (!ctx) {
    return {
      kind: null,
      eligible: false,
      completed: true,
      active: false,
      stepId: null,
      step: null,
      stepIndex: 0,
      stepTotal: 0,
      resumeStepId: null,
      startOrResume: () => {},
      pause: () => {},
      advance: () => {},
      oralSubStepIndex: null,
    };
  }
  return ctx;
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

  const completed = Boolean(user?.guideTour?.completed);
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
  const autoStartedRef = useRef(false);
  const persistSeq = useRef(0);

  const stepIndex = kind ? getGuideTourStepIndex(kind, stepId) : 0;
  const step = steps[stepIndex] ?? null;
  const stepTotal = steps.length;

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
    const id = resumeStepId || steps[0]?.id;
    if (!id) return;
    goToStep(id);
  }, [kind, completed, resumeStepId, steps, goToStep]);

  const pause = useCallback(() => {
    if (!stepId) {
      setActive(false);
      return;
    }
    void persist({ resumeStepId: stepId });
    setActive(false);
  }, [stepId, persist]);

  const advance = useCallback(() => {
    if (!kind || !step) return;
    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      setActive(false);
      setStepId(null);
      applyLocalGuideTour({ completed: true, resumeStepId: null });
      void persist({ completed: true, resumeStepId: null });
      return;
    }
    const next = steps[nextIdx];
    if (!next) return;
    goToStep(next.id);
  }, [kind, step, stepIndex, steps, goToStep, persist, applyLocalGuideTour]);

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
    if (!step || !isOralGuideTourStepId(step.id) || !step.oralSubStepId) {
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
    resumeStepId,
    startOrResume,
    pause,
    advance,
    oralSubStepIndex,
  };

  const showCoach = active && step;

  return (
    <GuideTourContext.Provider value={value}>
      {children}
      {showCoach ? (
        <GuideTourSpotlight
          stepIndex={stepIndex}
          stepTotal={stepTotal}
          title={step.title}
          hint={step.hint}
          target={step.target}
          showNext={step.advance === "next"}
          nextLabel={
            step.id === "wrap" ? "완료" : step.id === "intro" ? "계속" : "다음"
          }
          onNext={advance}
          onPause={pause}
        />
      ) : null}
    </GuideTourContext.Provider>
  );
}
