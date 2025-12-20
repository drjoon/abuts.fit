import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type GuideTourId = "requestor-onboarding";

export type GuideStep = {
  id: string;
  title: string;
  description?: string;
};

const TOUR_DEFINITIONS: Record<GuideTourId, GuideStep[]> = {
  "requestor-onboarding": [
    {
      id: "requestor.business.companyName",
      title: "기공소명 입력",
      description: "기공소명을 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.businessNumber",
      title: "사업자등록번호 입력",
      description: "사업자등록번호를 입력하고 Enter로 다음 단계로 넘어가세요.",
    },
    {
      id: "requestor.business.save",
      title: "기공소 정보 저장",
      description: "저장하기를 눌러 기공소 설정을 완료해주세요.",
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
  isStepActive: (stepId: string) => boolean;
  pendingRedirectTo: string | null;
  clearPendingRedirectTo: () => void;
  getStepMeta: (stepId: string) => {
    step: GuideStep | undefined;
    index: number;
  };
}

const GuideTourContext = createContext<GuideTourState | null>(null);

export const GuideTourProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [active, setActive] = useState(false);
  const [activeTourId, setActiveTourId] = useState<GuideTourId | null>(null);
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [pendingRedirectTo, setPendingRedirectTo] = useState<string | null>(
    null
  );

  const reset = useCallback(() => {
    setActive(false);
    setActiveTourId(null);
    setSteps([]);
    setCurrentStepIndex(0);
    setReturnTo(null);
  }, []);

  const clearPendingRedirectTo = useCallback(() => {
    setPendingRedirectTo(null);
  }, []);

  const startTour = useCallback(
    (tourId: GuideTourId, initialStepId?: string, nextReturnTo?: string) => {
      const tourSteps = TOUR_DEFINITIONS[tourId] || [];
      if (!tourSteps.length) return;

      let initialIndex = 0;
      if (initialStepId) {
        for (let i = 0; i < tourSteps.length; i += 1) {
          const step = tourSteps[i];
          if (step.id === initialStepId) {
            initialIndex = i;
            break;
          }
        }
      }

      setSteps(tourSteps);
      setActive(true);
      setActiveTourId(tourId);
      setCurrentStepIndex(initialIndex >= 0 ? initialIndex : 0);
      setReturnTo(nextReturnTo ? String(nextReturnTo) : null);
      setPendingRedirectTo(null);
    },
    []
  );

  const stopTour = useCallback(() => {
    reset();
  }, [reset]);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (prev + 1 >= steps.length) {
        reset();
        return prev;
      }
      return prev + 1;
    });
  }, [reset, steps.length]);

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
      if (stepId && current?.id !== stepId) return;
      if (!stepId && !current) return;
      if (currentStepIndex === steps.length - 1) {
        if (returnTo) {
          setPendingRedirectTo(returnTo);
        }
        reset();
        return;
      }
      setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    },
    [currentStepIndex, reset, returnTo, steps]
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
