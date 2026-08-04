// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback } from "react";
import { type ManufacturerRequest, deriveStageForFilter, getReviewStageKeyByTab } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { useToast } from "@/shared/hooks/use-toast";

interface CardActionHandlers {
  handleDeleteStageFile: (opts: Record<string, unknown>) => Promise<void>;
  handleDeleteNc: (req: ManufacturerRequest, opts: Record<string, unknown>) => Promise<void>;
  handleUpdateReviewStatus: (opts: Record<string, unknown>) => Promise<void>;
}

export const useCardActions = (
  tabStage: string,
  isCamStage: boolean,
  isMachiningStage: boolean,
  handlers: CardActionHandlers,
  realtimeBaseRef: React.MutableRefObject<Record<string, number>>,
  pendingStageTransitionToastRef: React.MutableRefObject<
    Record<
      string,
      {
        toastId: string;
        expectedStages: string[];
        createdAt: number;
      }
    >
  >,
) => {
  const {
    handleDeleteStageFile,
    handleDeleteNc,
    handleUpdateReviewStatus,
  } = handlers;
  const { toast, dismiss } = useToast();

  const showPendingStageTransitionToast = useCallback(
    (
      requestId: string,
      title: string,
      description: string,
      expectedStages: string[],
    ) => {
      if (!requestId) return;
      const prevPending = pendingStageTransitionToastRef.current[requestId];
      if (prevPending?.toastId) {
        dismiss(prevPending.toastId);
      }

      const pendingToast = toast({
        title,
        description,
        duration: 3000,
        skipDuplicateCheck: true,
      });

      if (pendingToast?.id) {
        pendingStageTransitionToastRef.current[requestId] = {
          toastId: pendingToast.id,
          expectedStages,
          createdAt: Date.now(),
        };

        window.setTimeout(() => {
          const current = pendingStageTransitionToastRef.current[requestId];
          if (current?.toastId === pendingToast.id) {
            delete pendingStageTransitionToastRef.current[requestId];
          }
        }, 16000);
      }
    },
    [pendingStageTransitionToastRef, dismiss, toast],
  );

  const handleCardRollback = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stage = deriveStageForFilter(req);

      if (stage === "가공") {
        const requestId = String(req.requestId || "").trim();
        showPendingStageTransitionToast(
          requestId,
          "준비 롤백 요청 전송됨",
          "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
          ["준비"],
        );
        // 작업 공정 변경: 중간 단계를 건너뛰고 가공 → 준비로 직접 롤백
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }
      if (stage === "CAM") {
        const requestId = String(req.requestId || "").trim();
        showPendingStageTransitionToast(
          requestId,
          "준비 롤백 요청 전송됨",
          "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
          ["준비"],
        );
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }
      if (stage === "세척.포장" || stage === "세척.패킹") {
        return handleDeleteStageFile({
          req,
          stage: "packing",
          rollbackOnly: true,
        });
      }
      if (stage === "발송" || stage === "포장.발송") {
        return handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
      }
      if (stage === "추적관리") {
        return handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
      }
      if (tabStage === "machining") {
        const requestId = String(req.requestId || "").trim();
        showPendingStageTransitionToast(
          requestId,
          "준비 롤백 요청 전송됨",
          "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
          ["준비"],
        );
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }
      if (tabStage === "cam") {
        const requestId = String(req.requestId || "").trim();
        showPendingStageTransitionToast(
          requestId,
          "준비 롤백 요청 전송됨",
          "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
          ["준비"],
        );
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }
      if (tabStage === "shipping") {
        return handleUpdateReviewStatus({
          req,
          status: "PENDING",
          stageOverride: "shipping",
        });
      }
      const requestId = String(req.requestId || "").trim();
      showPendingStageTransitionToast(
        requestId,
        "준비 롤백 요청 전송됨",
        "가공 건을 준비 단계로 되돌리는 중입니다. 잠시만 기다려주세요.",
        ["준비"],
      );
      return handleDeleteNc(req, {
        nextStage: "request",
        rollbackOnly: true,
        navigate: false,
      });
    },
    [
      handleDeleteStageFile,
      handleDeleteNc,
      handleUpdateReviewStatus,
      tabStage,
      showPendingStageTransitionToast,
    ],
  );

  const handleCardApprove = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stageKey = getReviewStageKeyByTab({
        stage: tabStage,
        isCamStage,
        isMachiningStage,
      });

      // 준비 승인 화살표 SSOT: stage=machining + nextUpCamRunGuard 로 가공 진입.
      // (레거시 review 키 cam 사용 금지)
      const transitionStageKey =
        stageKey === "request" ? "machining" : stageKey;

      const isRequestNextUpTransition =
        stageKey === "request" && transitionStageKey === "machining";

      if (stageKey === "request") {
        const requestId = String(req.requestId || "").trim();
        if (requestId) {
          realtimeBaseRef.current[requestId] = Date.now();
          showPendingStageTransitionToast(
            requestId,
            "가공 이동 요청 전송됨",
            "의뢰를 가공으로 넘기는 중입니다. 잠시만 기다려주세요.",
            ["가공"],
          );
        }
      }
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: transitionStageKey,
        // 작업 탭 승인(request)은 기존 NC 재사용 우선(재생성 강제 안 함)
        forceReprocess: false,
        approvalTriggerSource: "worksheet-tab",
        nextUpCamRunGuard: isRequestNextUpTransition,
      });
    },
    [
      tabStage,
      isCamStage,
      isMachiningStage,
      handleUpdateReviewStatus,
      realtimeBaseRef,
      showPendingStageTransitionToast,
    ],
  );

  return { handleCardRollback, handleCardApprove };
};
