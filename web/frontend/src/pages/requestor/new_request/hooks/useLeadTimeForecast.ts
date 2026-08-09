// change-log:
// - 2026-08-09: 디자인+생산 ETA에 productMode(+1영업일) 전달.
// - 2026-08-06: 묶음 ETA를 백엔드와 같이 (N-1) 적용. 접수 당일=1일차(자정 컷오프).
// - 2026-08-08: memo/stale closure 제거 — computeEstimatedShipLabel render 시점 호출.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/shipping/estimateShipDate.ts
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import type { CaseInfos } from "./newRequestTypes";
import {
  computeEstimatedShipLabel,
  logEstimatedShipDebug,
  type LeadTimesMap,
} from "@/shared/shipping/estimateShipDate";
import { serializeWeeklyBatchDays } from "@/shared/shipping/weeklyBatchSchedule";

type ManufacturerLeadTimesResponse = {
  data?: {
    leadTimes?: LeadTimesMap;
  };
};

type Params = {
  token?: string | null;
  weeklyBatchDays?: string[];
  files: File[];
  updateCaseInfos: (fileKey: string, updates: Partial<CaseInfos>) => void;
  toNormalizedFileKey: (file: File) => string;
};

export function useLeadTimeForecast({
  token,
  weeklyBatchDays = [],
  files,
  updateCaseInfos,
  toNormalizedFileKey,
}: Params) {
  const [leadTimes, setLeadTimes] = useState<LeadTimesMap | null>(null);
  const [fileDiameters, setFileDiameters] = useState<Record<string, number>>({});

  const weeklyBatchDaysKey = serializeWeeklyBatchDays(weeklyBatchDays);

  useEffect(() => {
    const loadLeadTimes = async () => {
      if (!token) return;
      try {
        const leadRes = await apiFetch<ManufacturerLeadTimesResponse>({
          path: "/api/businesses/manufacturer-lead-times",
          method: "GET",
          token,
        });
        if (leadRes.ok && leadRes.data?.data?.leadTimes) {
          setLeadTimes(leadRes.data.data.leadTimes);
        }
      } catch (e) {
        console.error("Failed to load lead times:", e);
      }
    };

    void loadLeadTimes();
  }, [token]);

  useEffect(() => {
    logEstimatedShipDebug("policy-changed", {
      weeklyBatchDays,
      leadTimes,
      shippingMode: "normal",
    });
  }, [weeklyBatchDaysKey, leadTimes, weeklyBatchDays]);

  const getEstimatedShipForDiameter = useCallback(
    (
      diameter: number | null,
      shippingMode: "normal" | "express" = "normal",
      productMode: string | null = null,
    ) => {
      const label = computeEstimatedShipLabel({
        weeklyBatchDays,
        leadTimes,
        diameter,
        shippingMode,
        productMode,
      });
      logEstimatedShipDebug("file-eta", {
        weeklyBatchDays,
        leadTimes,
        diameter,
        shippingMode,
        productMode,
        label,
      });
      return label;
    },
    [leadTimes, weeklyBatchDays, weeklyBatchDaysKey],
  );

  const handleDiameterComputed = useCallback(
    (
      filename: string,
      maxDiameter: number,
      connectionDiameter: number,
      totalLength: number,
      taperAngle: number,
      tiltAxisVector?: { x: number; y: number; z: number } | null,
      frontPoint?: { x: number; y: number; z: number } | null,
    ) => {
      const matchedFile = files.find((f) => f.name === filename);
      if (!matchedFile) return;

      const fileKey = toNormalizedFileKey(matchedFile);
      setFileDiameters((prev) => ({
        ...prev,
        [fileKey]: maxDiameter,
      }));

      updateCaseInfos(fileKey, {
        maxDiameter,
        connectionDiameter,
        totalLength,
        taperAngle,
        tiltAxisVector,
        frontPoint,
      });
    },
    [files, updateCaseInfos, toNormalizedFileKey],
  );

  return {
    fileDiameters,
    getEstimatedShipForDiameter,
    handleDiameterComputed,
    leadTimes,
    weeklyBatchDaysKey,
  };
}
