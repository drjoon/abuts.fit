import { useCallback } from "react";
import { type ManufacturerRequest, deriveStageForFilter, getReviewStageKeyByTab } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

interface CardActionHandlers {
  handleDeleteStageFile: (opts: any) => Promise<void>;
  handleDeleteNc: (req: ManufacturerRequest, opts: any) => Promise<void>;
  handleUpdateReviewStatus: (opts: any) => Promise<void>;
}

export const useCardActions = (
  tabStage: string,
  isCamStage: boolean,
  isMachiningStage: boolean,
  handlers: CardActionHandlers,
  realtimeBaseRef: React.MutableRefObject<Record<string, number>>,
) => {
  const { handleDeleteStageFile, handleDeleteNc, handleUpdateReviewStatus } = handlers;

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
      if (stageKey === "request") {
        realtimeBaseRef.current[String(req.requestId || "").trim()] = Date.now();
      }
      void handleUpdateReviewStatus({
        req,
        status: "APPROVED",
        stageOverride: stageKey,
      });
    },
    [tabStage, isCamStage, isMachiningStage, handleUpdateReviewStatus, realtimeBaseRef],
  );

  return { handleCardRollback, handleCardApprove };
};
