// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useRequestFileHandlers.ts
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback } from "react";
import { type ManufacturerRequest, deriveStageForFilter, getReviewStageKeyByTab } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

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
) => {
  const {
    handleDeleteStageFile,
    handleDeleteNc,
    handleUpdateReviewStatus,
  } = handlers;

  const handleCardRollback = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stage = deriveStageForFilter(req);

      if (stage === "가공") {
        // 작업 공정 변경: 중간 단계를 건너뛰고 가공 → 준비로 직접 롤백
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }
      if (stage === "CAM") {
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
        return handleDeleteNc(req, {
          nextStage: "request",
          rollbackOnly: true,
          navigate: false,
        });
      }
      if (tabStage === "cam") {
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
      return handleDeleteNc(req, {
        nextStage: "request",
        rollbackOnly: true,
        navigate: false,
      });
    },
    [handleDeleteStageFile, handleDeleteNc, handleUpdateReviewStatus, tabStage],
  );

  const handleCardApprove = useCallback(
    (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stageKey = getReviewStageKeyByTab({
        stage: tabStage,
        isCamStage,
        isMachiningStage,
      });

      // 작업 공정 변경: 준비 승인 화살표는 CAM을 건너뛰어 가공 전이 로직을 사용한다.
      const transitionStageKey =
        stageKey === "request" ? "cam" : stageKey;

      const isRequestNextUpTransition =
        stageKey === "request" && transitionStageKey === "cam";

      if (stageKey === "request") {
        realtimeBaseRef.current[String(req.requestId || "").trim()] = Date.now();
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
    ],
  );

  return { handleCardRollback, handleCardApprove };
};
