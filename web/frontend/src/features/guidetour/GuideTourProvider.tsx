import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export type GuideTourId = "requestor-onboarding" | "requestor-new-request";

export type GuideStep = {
  id: string;
  title: string;
  description?: string;
};

const TOUR_DEFINITIONS: Record<GuideTourId, GuideStep[]> = {
  "requestor-onboarding": [
    {
      id: "requestor.account.profileImage",
      title: "프로필 이미지 선택",
      description: "프로필 이미지를 선택해보세요.",
    },
    {
      id: "requestor.phone.number",
      title: "휴대폰번호 입력",
      description: "휴대폰번호 입력 후 Enter로 인증번호 발송을 진행하세요.",
    },
    {
      id: "requestor.phone.code",
      title: "인증번호 확인",
      description: "인증번호 입력 후 Enter로 인증을 완료하세요.",
    },
    {
      id: "requestor.business.licenseUpload",
      title: "사업자등록증 업로드",
      description: "사업자등록증을 업로드해주세요.",
    },
    {
      id: "requestor.business.companyName",
      title: "기공소명 입력",
      description: "기공소명을 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.representativeName",
      title: "대표자명 입력",
      description: "대표자명을 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.phoneNumber",
      title: "기공소 전화번호 입력",
      description: "기공소 전화번호를 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.businessNumber",
      title: "사업자등록번호 입력",
      description: "사업자등록번호를 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.businessType",
      title: "업태 입력",
      description: "업태를 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.businessItem",
      title: "종목 입력",
      description: "종목을 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.email",
      title: "세금계산서 이메일 입력",
      description:
        "세금계산서 이메일을 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.address",
      title: "주소 입력",
      description: "기공소 주소를 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
  ],
  "requestor-new-request": [
    {
      id: "requestor.new_request.upload",
      title: "STL 업로드",
      description: "커스텀 어벗 STL 파일을 업로드해주세요.",
    },
    {
      id: "requestor.new_request.details",
      title: "의뢰 정보 입력",
      description: "치과명/환자명/치아번호 등 정보를 확인해주세요.",
    },
    {
      id: "requestor.new_request.shipping",
      title: "배송 선택 후 의뢰하기",
      description: "배송 옵션을 선택한 뒤 의뢰하기를 눌러주세요.",
    },
  ],
};

interface GuideTourState {
  active: boolean;
  activeTourId: GuideTourId | null;
  steps: GuideStep[];
  currentStepIndex: number;
  startTour: (
    tourId: GuideTourId,
    initialStepId?: string,
    returnTo?: string
  ) => void;
  stopTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (stepId: string) => void;
  completeStep: (stepId?: string) => void;
  setStepCompleted: (stepId: string, completed?: boolean) => void;
  syncStepStatus: (params: {
    tourId: GuideTourId;
    stepId: string;
    done: boolean;
  }) => void;
  isStepCompleted: (stepId: string) => boolean;
  isStepActive: (stepId: string) => boolean;
  pendingRedirectTo: string | null;
  clearPendingRedirectTo: () => void;
  getStepMeta: (stepId: string) => {
    step: GuideStep | undefined;
    index: number;
  };
}

type PersistedGuideState = {
  tourId: GuideTourId;
  stepId: string;
  returnTo?: string | null;
};

const GUIDE_STATE_STORAGE_KEY = "guide_tour_state_v2";

const getGuideStateStorageKey = (userId?: string | null) => {
  if (!userId) return null;
  return `${GUIDE_STATE_STORAGE_KEY}:${userId}`;
};

const readPersistedGuideState = (
  userId?: string | null
): PersistedGuideState | null => {
  try {
    const storageKey = getGuideStateStorageKey(userId);
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.tourId || !parsed?.stepId) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writePersistedGuideState = (
  userId: string | null,
  state: PersistedGuideState | null
) => {
  try {
    const storageKey = getGuideStateStorageKey(userId);
    if (!storageKey) return;
    if (!state) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore
  }
};

const GuideTourContext = createContext<GuideTourState | null>(null);

const emitGuideProgressUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("abuts:guide-progress:updated"));
};

export const GuideTourProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const token = useAuthStore((s) => s.token);
  const authUserId = useAuthStore((s) => s.user?.id || null);
  const [active, setActive] = useState(false);
  const [activeTourId, setActiveTourId] = useState<GuideTourId | null>(null);
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(
    () => new Set()
  );
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [pendingRedirectTo, setPendingRedirectTo] = useState<string | null>(
    null
  );
  const lastSyncedStepStatusRef = useRef<Map<string, boolean>>(new Map());

  const progressHydratingRef = useRef(false);
  const prevCompletedStepIdsRef = useRef<Set<string>>(new Set());
  const progressLoadSeqRef = useRef(0);
  const resumeAttemptedForUserRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setActive(false);
    setActiveTourId(null);
    setSteps([]);
    setCurrentStepIndex(0);
    setCompletedStepIds(new Set());
    setProgressLoaded(false);
    setReturnTo(null);
  }, []);

  const findFirstIncompleteIndex = useCallback(
    (nextSteps: GuideStep[], completed: Set<string>) => {
      for (let i = 0; i < nextSteps.length; i += 1) {
        const step = nextSteps[i];
        if (!completed.has(step.id)) return i;
      }
      return -1;
    },
    []
  );

  useEffect(() => {
    if (!active) return;
    if (!activeTourId) return;
    if (!token) {
      setProgressLoaded(true);
      return;
    }

    const seq = (progressLoadSeqRef.current += 1);
    void (async () => {
      try {
        const res = await request<any>({
          path: `/api/guide-progress/${encodeURIComponent(activeTourId)}`,
          method: "GET",
          token,
        });
        if (seq !== progressLoadSeqRef.current) return;
        if (!res.ok) {
          setProgressLoaded(true);
          return;
        }

        const body: any = res.data || {};
        const data = body.data || body;
        const rows = Array.isArray(data?.steps) ? data.steps : [];
        const doneIds = rows
          .filter((s: any) => String(s?.status || "") === "done")
          .map((s: any) => String(s?.stepId || "").trim())
          .filter(Boolean);

        progressHydratingRef.current = true;
        setCompletedStepIds(new Set(doneIds));
        setProgressLoaded(true);
      } catch {
        if (seq !== progressLoadSeqRef.current) return;
        setProgressLoaded(true);
        // ignore
      }
    })();
  }, [active, activeTourId, token]);

  useEffect(() => {
    if (active) return;
    if (!authUserId) {
      resumeAttemptedForUserRef.current = null;
      return;
    }
    if (resumeAttemptedForUserRef.current === authUserId) return;
    resumeAttemptedForUserRef.current = authUserId;
    const persisted = readPersistedGuideState(authUserId);
    if (!persisted?.tourId) return;
    const tourSteps = TOUR_DEFINITIONS[persisted.tourId];
    if (!tourSteps?.length) {
      writePersistedGuideState(authUserId, null);
      return;
    }
    const persistedIndex = tourSteps.findIndex(
      (s) => s.id === persisted.stepId
    );
    const initialIndex = persistedIndex >= 0 ? persistedIndex : 0;
    setSteps(tourSteps);
    setActive(true);
    setActiveTourId(persisted.tourId);
    setCurrentStepIndex(initialIndex);
    setCompletedStepIds(new Set());
    setProgressLoaded(false);
    setReturnTo(persisted.returnTo || null);
  }, [active]);

  useEffect(() => {
    if (!authUserId) return;
    if (!active || !activeTourId || !steps.length) {
      writePersistedGuideState(authUserId, null);
      return;
    }
    const currentStep = steps[currentStepIndex];
    if (!currentStep) {
      writePersistedGuideState(authUserId, null);
      return;
    }
    writePersistedGuideState(authUserId, {
      tourId: activeTourId,
      stepId: currentStep.id,
      returnTo,
    });
  }, [active, activeTourId, authUserId, currentStepIndex, steps, returnTo]);

  const clearPendingRedirectTo = useCallback(() => {
    setPendingRedirectTo(null);
  }, []);

  const syncStepStatus = useCallback(
    ({
      tourId,
      stepId,
      done,
    }: {
      tourId: GuideTourId;
      stepId: string;
      done: boolean;
    }) => {
      if (!tourId || !stepId) return;
      if (tourId === activeTourId) {
        setCompletedStepIds((prev) => {
          const has = prev.has(stepId);
          if (done && has) return prev;
          if (!done && !has) return prev;
          const next = new Set(prev);
          if (done) next.add(stepId);
          else next.delete(stepId);
          return next;
        });
      }

      const key = `${tourId}:${stepId}`;
      const prevStatus = lastSyncedStepStatusRef.current.get(key);
      if (prevStatus === done) return;
      lastSyncedStepStatusRef.current.set(key, done);

      if (!token) return;
      void (async () => {
        try {
          await request<any>({
            path: `/api/guide-progress/${encodeURIComponent(
              tourId
            )}/steps/${encodeURIComponent(stepId)}`,
            method: "PATCH",
            token,
            jsonBody: { done },
          });
          emitGuideProgressUpdated();
        } catch {
          // ignore failure; will retry on next sync
        }
      })();
    },
    [activeTourId, token]
  );

  const startTour = useCallback(
    (tourId: GuideTourId, initialStepId?: string, nextReturnTo?: string) => {
      const tourSteps = TOUR_DEFINITIONS[tourId] || [];
      if (!tourSteps.length) return;

      const completed = new Set<string>();

      let initialIndex = -1;
      if (initialStepId) {
        for (let i = 0; i < tourSteps.length; i += 1) {
          if (tourSteps[i]?.id === initialStepId) {
            initialIndex = i;
            break;
          }
        }
      }

      const firstIncomplete = findFirstIncompleteIndex(tourSteps, completed);
      const resolvedInitialIndex =
        initialIndex >= 0
          ? initialIndex
          : firstIncomplete >= 0
          ? firstIncomplete
          : 0;

      setSteps(tourSteps);
      setActive(true);
      setActiveTourId(tourId);
      setCurrentStepIndex(resolvedInitialIndex);
      setCompletedStepIds(completed);
      setProgressLoaded(false);
      setReturnTo(nextReturnTo ? String(nextReturnTo) : null);
      setPendingRedirectTo(null);
    },
    [findFirstIncompleteIndex]
  );

  const stopTour = useCallback(() => {
    reset();
  }, [reset]);

  const findNextIncompleteIndex = useCallback(
    (nextSteps: GuideStep[], completed: Set<string>, fromIndex: number) => {
      if (!nextSteps.length) return -1;
      for (let i = Math.max(0, fromIndex + 1); i < nextSteps.length; i += 1) {
        const step = nextSteps[i];
        if (!completed.has(step.id)) return i;
      }
      return -1;
    },
    []
  );

  useEffect(() => {
    if (!active) return;
    if (!steps.length) return;
    if (!progressLoaded) return;
    const firstIncomplete = findFirstIncompleteIndex(steps, completedStepIds);
    if (firstIncomplete < 0) return;
    if (currentStepIndex === firstIncomplete) return;
    setCurrentStepIndex(firstIncomplete);
  }, [
    active,
    completedStepIds,
    currentStepIndex,
    findFirstIncompleteIndex,
    progressLoaded,
    steps,
  ]);

  useEffect(() => {
    if (!active) return;
    if (!steps.length) return;
    if (!progressLoaded) return;
    const firstIncomplete = findFirstIncompleteIndex(steps, completedStepIds);
    if (firstIncomplete >= 0) return;

    if (returnTo) {
      setPendingRedirectTo(returnTo);
    }
    reset();
  }, [
    active,
    activeTourId,
    completedStepIds,
    findFirstIncompleteIndex,
    progressLoaded,
    reset,
    returnTo,
    steps,
  ]);

  const nextStep = useCallback(() => {
    if (!steps.length) return;

    const nextIncomplete = findNextIncompleteIndex(
      steps,
      completedStepIds,
      currentStepIndex
    );
    if (nextIncomplete >= 0) {
      setCurrentStepIndex(nextIncomplete);
      return;
    }

    const firstIncomplete = findFirstIncompleteIndex(steps, completedStepIds);
    if (firstIncomplete >= 0) {
      setCurrentStepIndex(firstIncomplete);
      return;
    }
    if (returnTo) {
      setPendingRedirectTo(returnTo);
    }
    reset();
  }, [
    activeTourId,
    completedStepIds,
    currentStepIndex,
    findFirstIncompleteIndex,
    findNextIncompleteIndex,
    reset,
    returnTo,
    steps,
  ]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStep = useCallback(
    (stepId: string) => {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        if (step.id === stepId) {
          setCurrentStepIndex(i);
          break;
        }
      }
    },
    [steps]
  );

  const completeStep = useCallback(
    (stepId?: string) => {
      if (!steps.length) return;
      const current = steps[currentStepIndex];
      const targetId = stepId || current?.id;
      if (!targetId) return;

      if (activeTourId) {
        syncStepStatus({ tourId: activeTourId, stepId: targetId, done: true });
      }

      const nextCompleted = new Set(completedStepIds);
      nextCompleted.add(targetId);
      setCompletedStepIds(nextCompleted);

      const nextIndex = findFirstIncompleteIndex(steps, nextCompleted);
      if (nextIndex < 0) {
        if (returnTo) {
          setPendingRedirectTo(returnTo);
        }
        reset();
        return;
      }

      setCurrentStepIndex(nextIndex);
    },
    [
      activeTourId,
      completedStepIds,
      currentStepIndex,
      findFirstIncompleteIndex,
      reset,
      returnTo,
      token,
      steps,
    ]
  );

  const setStepCompleted = useCallback(
    (stepId: string, completed: boolean = true) => {
      setCompletedStepIds((prev) => {
        const has = prev.has(stepId);
        if (completed && has) return prev;
        if (!completed && !has) return prev;
        const next = new Set(prev);
        if (completed) next.add(stepId);
        else next.delete(stepId);
        return next;
      });

      if (activeTourId) {
        syncStepStatus({
          tourId: activeTourId,
          stepId,
          done: completed,
        });
      }
    },
    [activeTourId, syncStepStatus]
  );

  const isStepCompleted = useCallback(
    (stepId: string) => completedStepIds.has(stepId),
    [completedStepIds]
  );

  const isStepActive = useCallback(
    (stepId: string) => {
      if (!active) return false;
      const step = steps[currentStepIndex];
      return step?.id === stepId;
    },
    [active, currentStepIndex, steps]
  );

  const getStepMeta = useCallback(
    (stepId: string) => {
      let index = -1;
      let targetStep: GuideStep | undefined;
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        if (step.id === stepId) {
          index = i;
          targetStep = step;
          break;
        }
      }
      return {
        step: targetStep,
        index,
      };
    },
    [steps]
  );

  const value = useMemo(
    () => ({
      active,
      activeTourId,
      steps,
      currentStepIndex,
      startTour,
      stopTour,
      nextStep,
      prevStep,
      goToStep,
      completeStep,
      setStepCompleted,
      syncStepStatus,
      isStepCompleted,
      isStepActive,
      pendingRedirectTo,
      clearPendingRedirectTo,
      getStepMeta,
    }),
    [
      active,
      activeTourId,
      steps,
      currentStepIndex,
      startTour,
      stopTour,
      nextStep,
      prevStep,
      goToStep,
      completeStep,
      setStepCompleted,
      isStepCompleted,
      isStepActive,
      pendingRedirectTo,
      clearPendingRedirectTo,
      getStepMeta,
    ]
  );

  return (
    <GuideTourContext.Provider value={value}>
      {children}
    </GuideTourContext.Provider>
  );
};

export const useGuideTour = () => {
  const ctx = useContext(GuideTourContext);
  if (!ctx)
    throw new Error("useGuideTour must be used within GuideTourProvider");
  return ctx;
};

export const useGuideStepAdvance = (stepId: string) => {
  const { isStepActive, completeStep } = useGuideTour();

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isStepActive(stepId)) return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      completeStep(stepId);
    },
    [completeStep, isStepActive, stepId]
  );

  return { handleKeyDown };
};

export const getRequestorOnboardingSteps = () =>
  TOUR_DEFINITIONS["requestor-onboarding"];

export const getRequestorNewRequestSteps = () =>
  TOUR_DEFINITIONS["requestor-new-request"];
