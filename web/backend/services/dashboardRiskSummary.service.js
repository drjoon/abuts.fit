import Request from "../models/request.model.js";
import { computeShippingPriority } from "../controllers/requests/shippingPriority.utils.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "./requestDashboardCache.service.js";

const DEFAULT_RISK_SUMMARY = {
  delayedCount: 0,
  warningCount: 0,
  onTimeRate: 100,
  items: [],
};

export const getDashboardRiskSummaryData = async ({
  cacheKey,
  riskRequestFilter,
  debug = false,
  role = "requestor",
  populateRelated = false,
}) => {
  const normalizedCacheKey = String(cacheKey || "").trim();

  if (!debug && normalizedCacheKey) {
    const cached = getRequestPerfCacheValue(normalizedCacheKey);
    if (cached) {
      return cached;
    }
  }

  const built = await withRequestPerfInFlight(
    normalizedCacheKey || `dashboard-risk:${Date.now()}`,
    async () => {
      let query = Request.find(riskRequestFilter);

      if (populateRelated) {
        query = query
          .populate("requestor", "name business")
          .populate("caManufacturer", "name business")
          .populate("deliveryInfoRef");
      }

      const requests = await query.lean();
      const now = new Date();
      const delayedItems = [];
      const warningItems = [];

      for (const r of requests) {
        if (!r) continue;

        const pickedUpAt = r.deliveryInfoRef?.pickedUpAt
          ? new Date(r.deliveryInfoRef.pickedUpAt)
          : null;
        const deliveredAt = r.deliveryInfoRef?.deliveredAt
          ? new Date(r.deliveryInfoRef.deliveredAt)
          : null;
        const isDone =
          String(r?.manufacturerStage || "").trim() === "추적관리" ||
          Boolean(deliveredAt || pickedUpAt);
        if (isDone) continue;

        const stage = String(r.manufacturerStage || "").trim();
        const isPreShip = ["의뢰", "CAM", "생산"].includes(stage);
        if (!isPreShip) continue;

        const sp = await computeShippingPriority({ request: r, now });
        if (!sp) continue;

        if (sp.level === "danger") {
          delayedItems.push({ r, shippingPriority: sp });
          continue;
        }
        if (sp.level === "warning") {
          warningItems.push({ r, shippingPriority: sp });
        }
      }

      const totalWithDeadline = delayedItems.length + warningItems.length;
      const delayedCount = delayedItems.length;
      const warningCount = warningItems.length;
      const onTimeBase = Math.max(1, totalWithDeadline + 1);
      const onTimeRate = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((onTimeBase - delayedCount - warningCount) / onTimeBase) * 100,
          ),
        ),
      );

      const toRiskItem = (entry, level) => {
        const r = entry?.r || entry;
        const sp = entry?.shippingPriority || null;
        const ci = r?.caseInfos || {};

        const requestorText =
          r?.requestor?.business || r?.requestor?.name || "";
        const manufacturerText =
          r?.manufacturer?.business ||
          r?.manufacturer?.name ||
          r?.caManufacturer?.business ||
          r?.caManufacturer?.name ||
          "";

        const secondaryText =
          role === "manufacturer"
            ? requestorText
            : [requestorText, manufacturerText].filter(Boolean).join(" → ");

        const title =
          (r?.title || "").trim() ||
          [ci.patientName, ci.tooth].filter(Boolean).join(" ") ||
          r?.requestId ||
          "";

        const message =
          level === "danger"
            ? `출고 마감(15:00) 기준 처리 지연 위험이 매우 큽니다. ${
                sp?.label || ""
              }`.trim()
            : `출고 마감(15:00)이 임박했습니다. ${sp?.label || ""}`.trim();

        return {
          id: r?.requestId,
          title,
          manufacturer: secondaryText,
          riskLevel: level,
          dueDate: sp?.deadlineAt || null,
          message,
          caseInfos: r?.caseInfos || {},
          shippingPriority: sp || undefined,
        };
      };

      const riskItems = [
        ...delayedItems
          .slice()
          .sort(
            (a, b) =>
              (b?.shippingPriority?.score || 0) -
              (a?.shippingPriority?.score || 0),
          )
          .slice(0, 5)
          .map((entry) => toRiskItem(entry, "danger")),
        ...warningItems
          .slice()
          .sort(
            (a, b) =>
              (b?.shippingPriority?.score || 0) -
              (a?.shippingPriority?.score || 0),
          )
          .slice(0, 5)
          .map((entry) => toRiskItem(entry, "warning")),
      ];

      const responseData = {
        requests,
        riskSummary: {
          delayedCount,
          warningCount,
          onTimeRate,
          items: riskItems,
        },
      };

      if (!debug && normalizedCacheKey) {
        setRequestPerfCacheValue(normalizedCacheKey, responseData, 15 * 1000);
      }

      return responseData;
    },
  );

  return built || { requests: [], riskSummary: DEFAULT_RISK_SUMMARY };
};
