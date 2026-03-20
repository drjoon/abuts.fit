import Request from "../models/request.model.js";
import { calculateRiskSummary } from "../controllers/requests/production.utils.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "./requestDashboardCache.service.js";

export const getRequestorDashboardRiskSummaryData = async ({
  businessAnchorId,
  periodKey,
  riskRequestFilter,
  debug = false,
}) => {
  const anchorId = String(businessAnchorId || "").trim();
  const normalizedPeriodKey = String(periodKey || "30d").trim() || "30d";
  const cacheKey = `requestor-dashboard-risk-summary:${anchorId}:${normalizedPeriodKey}`;

  if (!debug) {
    const cached = getRequestPerfCacheValue(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const built = await withRequestPerfInFlight(cacheKey, async () => {
    const activeRequests = await Request.find(riskRequestFilter)
      .select(
        "requestId title manufacturerStage productionSchedule caseInfos createdAt timeline shippingMode finalShipping originalShipping",
      )
      .lean();

    const responseData = {
      activeRequests,
      riskSummary: calculateRiskSummary(activeRequests),
    };

    if (!debug) {
      setRequestPerfCacheValue(cacheKey, responseData, 15 * 1000);
    }

    return responseData;
  });

  return built;
};
