// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback } from "react";
import { type ManufacturerRequest, deriveStageForFilter, getReviewStageKeyByTab } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

interface CardActionHandlers {
  handleDeleteStageFile: (opts: Record<string, unknown>) => Promise<void>;
  handleDeleteNc: (req: ManufacturerRequest, opts: Record<string, unknown>) => Promise<void>;
  handleUpdateReviewStatus: (opts: Record<string, unknown>) => Promise<void>;
  handleRequestNcRegenerate?: (req: ManufacturerRequest) => Promise<boolean | void>;
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
    handleRequestNcRegenerate,
  } = handlers;

  const handleCardRollback = useCallback(
    async (req: ManufacturerRequest) => {
      if (!req?._id) return;
      const stage = deriveStageForFilter(req);

      if (stage === "가공") {
        return handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
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
        return handleDeleteStageFile({
          req,
          stage: "machining",
          rollbackOnly: true,
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

      // CAM 승인 전 NC가 없으면 승인 대신 NC 생성 명령을 먼저 수행한다.
      // NC 생성 결과는 백그라운드/웹소켓 동기화로 반영된다.
      if (stageKey === "cam") {
        const hasNcFile = Boolean(req?.caseInfos?.ncFile?.s3Key);
        if (!hasNcFile) {
          if (handleRequestNcRegenerate) {
            void handleRequestNcRegenerate(req);
          }
          return;
        }
      }

      if (stageKey === "request") {
        realtimeBaseRef.current[String(req.requestId || "").trim()] = Date.now();
      }
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: stageKey,
        // 작업 탭 승인(request)은 기존 NC 재사용 우선(재생성 강제 안 함)
        forceReprocess: false,
        approvalTriggerSource: "worksheet-tab",
      });
    },
    [
      tabStage,
      isCamStage,
      isMachiningStage,
      handleRequestNcRegenerate,
      handleUpdateReviewStatus,
      realtimeBaseRef,
    ],
  );

  return { handleCardRollback, handleCardApprove };
};
