import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import type { CaseInfos } from "./newRequestTypes";
import { WEEKDAY_TO_KST_INDEX } from "../components/newRequestDetailsUtils";

type LeadTimeEntry = {
  minBusinessDays?: number | string;
};

type LeadTimesMap = Partial<Record<"d6" | "d8" | "d10" | "d12", LeadTimeEntry>>;

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

  const getKstWeekday = useCallback((dateInput: Date) => {
    const kst = new Date(dateInput.getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCDay();
  }, []);

  const addBusinessDaysFromKstYmd = useCallback(
    (startYmd: string, days: number) => {
      if (!Number.isFinite(days) || days <= 0) return startYmd;

      const result = new Date(`${startYmd}T12:00:00+09:00`);
      if (Number.isNaN(result.getTime())) return startYmd;

      let added = 0;
      while (added < days) {
        result.setUTCDate(result.getUTCDate() + 1);
        const day = getKstWeekday(result);
        if (day !== 0 && day !== 6) {
          added += 1;
        }
      }

      return toKstYmd(result) || startYmd;
    },
    [getKstWeekday],
  );

  const resolveLeadDaysForPickup = useCallback((leadDays: number) => {
    if (!Number.isFinite(leadDays) || leadDays <= 0) return 1;
    return Math.max(1, leadDays);
  }, []);

  const formatKstMonthDayWithWeekday = useCallback((ymd: string) => {
    const date = new Date(`${ymd}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) return ymd;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }, []);

  const resolveWeeklyPickupYmd = useCallback(
    (baseYmd: string) => {
      const enabledDays = Array.from(
        new Set(
          (weeklyBatchDays || [])
            .map((d) => String(d || "").trim().toLowerCase())
            .filter((d) => Object.prototype.hasOwnProperty.call(WEEKDAY_TO_KST_INDEX, d)),
        ),
      );

      if (!enabledDays.length) {
        return baseYmd;
      }

      const enabledIndexes = enabledDays
        .map((d) => WEEKDAY_TO_KST_INDEX[d])
        .filter((v): v is number => Number.isFinite(v));

      if (!enabledIndexes.length) {
        return baseYmd;
      }

      const baseDate = new Date(`${baseYmd}T12:00:00+09:00`);
      if (Number.isNaN(baseDate.getTime())) {
        return baseYmd;
      }

      for (let offset = 0; offset < 14; offset += 1) {
        const candidate = new Date(baseDate);
        candidate.setUTCDate(candidate.getUTCDate() + offset);
        const candidateDay = getKstWeekday(candidate);
        if (!enabledIndexes.includes(candidateDay)) continue;

        const candidateYmd = toKstYmd(candidate) || baseYmd;
        return candidateYmd;
      }

      return baseYmd;
    },
    [getKstWeekday, weeklyBatchDays],
  );

  const calculateEstimatedShipDate = useCallback(() => {
    if (!leadTimes) return null;

    const cache = new Map<string, string>();

    return (diameter: number | null) => {
      if (!Number.isFinite(diameter) || diameter == null) return null;

      const requestedAt = new Date();
      const requestedYmd = toKstYmd(requestedAt);
      if (!requestedYmd) return null;

      const d = Number(diameter);
      let diameterKey: "d6" | "d8" | "d10" | "d12" = "d8";
      if (d <= 6) diameterKey = "d6";
      else if (d <= 8) diameterKey = "d8";
      else if (d <= 10) diameterKey = "d10";
      else diameterKey = "d12";

      const rawLead = leadTimes?.[diameterKey]?.minBusinessDays;
      const leadNumber = Number(rawLead);
      const leadDays = Number.isFinite(leadNumber) ? Math.max(1, leadNumber) : 1;
      const resolvedLeadDays = resolveLeadDaysForPickup(leadDays);
      const cacheKey = `${requestedYmd}:${diameterKey}:${resolvedLeadDays}`;

      if (cache.has(cacheKey)) {
        return cache.get(cacheKey) || null;
      }

      const baseShipYmd = addBusinessDaysFromKstYmd(requestedYmd, resolvedLeadDays);
      const shipYmd = resolveWeeklyPickupYmd(baseShipYmd);
      const formatted = formatKstMonthDayWithWeekday(shipYmd);

      const result = `${formatted} • ${resolvedLeadDays}영업일 후`;
      cache.set(cacheKey, result);
      return result;
    };
  }, [
    addBusinessDaysFromKstYmd,
    formatKstMonthDayWithWeekday,
    leadTimes,
    resolveLeadDaysForPickup,
    resolveWeeklyPickupYmd,
  ]);

  const getEstimatedShipForDiameter = useMemo(
    () => calculateEstimatedShipDate(),
    [calculateEstimatedShipDate],
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
  };
}
