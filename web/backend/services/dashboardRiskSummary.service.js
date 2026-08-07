// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/requests/dashboard.controller.js
// - web/backend/controllers/requests/shippingPriority.utils.js
// - web/backend/controllers/requests/shippingOnTime.utils.js
// change-log:
// - 2026-08-07: 묶음/신속 정시 출고 성공률을 지연 위험 요약에 포함.
// - 2026-08-07: 출고 마감 안내 문구 15:00 → 16:00.
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import DeliveryInfo from "../models/deliveryInfo.model.js";
import { computeShippingPriority } from "../controllers/requests/shippingPriority.utils.js";
import {
  evaluateShipOnTimeOutcome,
  summarizeShippingOnTimeRates,
} from "../controllers/requests/shippingOnTime.utils.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "./requestDashboardCache.service.js";

const DEFAULT_RISK_SUMMARY = {
  delayedCount: 0,
  warningCount: 0,
  onTimeRate: 100,
  expressOnTimeRate: 100,
  expressOnTimeCount: 0,
  expressEvaluatedCount: 0,
  normalOnTimeRate: 100,
  normalOnTimeCount: 0,
  normalEvaluatedCount: 0,
  items: [],
};

/** shippingPriority.utils 와 동일한 출고 전 공정 (영문 alias 포함) */
export const RISK_PRE_SHIP_STAGES = [
  "준비",
  "CAM",
  "가공",
  "cam",
  "machining",
];

const RISK_SUMMARY_SELECT = {
  _id: 1,
  requestId: 1,
  title: 1,
  manufacturerStage: 1,
  createdAt: 1,
  caseInfos: 1,
  timeline: 1,
  productionSchedule: 1,
  shippingMode: 1,
  finalShipping: 1,
  originalShipping: 1,
  rnd: 1,
  unmachinableDetailCode: 1,
  requestor: 1,
  caManufacturer: 1,
  manufacturer: 1,
  deliveryInfoRef: 1,
};

const ON_TIME_STATS_SELECT = {
  _id: 1,
  requestId: 1,
  shippingMode: 1,
  finalShipping: 1,
  originalShipping: 1,
  timeline: 1,
  productionSchedule: 1,
  deliveryInfoRef: 1,
  manufacturerStage: 1,
};

const isUnmachinableRequest = (r) => {
  const unmachinableAt = r?.rnd?.unmachinableAt
    ? new Date(r.rnd.unmachinableAt)
    : null;
  const unmachinableDetailCode = String(
    r?.rnd?.unmachinableDetailCode || r?.unmachinableDetailCode || "",
  )
    .trim()
    .toLowerCase();
  return (
    Boolean(unmachinableAt) ||
    (Boolean(unmachinableDetailCode) && unmachinableDetailCode !== "none")
  );
};

const hydrateRiskItemNames = async (riskItems) => {
  const needIds = new Set();
  for (const item of riskItems) {
    const r = item?.__request;
    if (!r) continue;
    if (r.requestor && typeof r.requestor !== "object") {
      needIds.add(String(r.requestor));
    }
    if (r.caManufacturer && typeof r.caManufacturer !== "object") {
      needIds.add(String(r.caManufacturer));
    }
  }

  if (needIds.size === 0) return;

  const users = await User.find({ _id: { $in: Array.from(needIds) } })
    .select({ name: 1, business: 1 })
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  for (const item of riskItems) {
    const r = item?.__request;
    if (!r) continue;
    if (r.requestor && typeof r.requestor !== "object") {
      r.requestor = byId.get(String(r.requestor)) || null;
    }
    if (r.caManufacturer && typeof r.caManufacturer !== "object") {
      r.caManufacturer = byId.get(String(r.caManufacturer)) || null;
    }
  }
};

async function computeOnTimeRateSummary(onTimeRequestFilter) {
  if (!onTimeRequestFilter || typeof onTimeRequestFilter !== "object") {
    return summarizeShippingOnTimeRates([]);
  }

  const todayYmd = getTodayYmdInKst();
  const rows = await Request.find(onTimeRequestFilter)
    .select(ON_TIME_STATS_SELECT)
    .lean();

  const deliveryIds = rows.map((r) => r.deliveryInfoRef).filter(Boolean);
  const deliveryDocs = deliveryIds.length
    ? await DeliveryInfo.find({ _id: { $in: deliveryIds } })
        .select({ pickedUpAt: 1, shippedAt: 1 })
        .lean()
    : [];
  const deliveryById = new Map(
    deliveryDocs.map((d) => [String(d._id), d]),
  );

  const evaluated = [];
  for (const r of rows) {
    if (!r || isUnmachinableRequest(r)) continue;
    if (String(r.manufacturerStage || "").trim() === "취소") continue;

    const stored = String(r?.timeline?.shipOutcome?.status || "").trim();
    if (stored === "on_time" || stored === "late") {
      const mode =
        r?.finalShipping?.mode === "express" ||
        r?.originalShipping?.mode === "express" ||
        r?.shippingMode === "express"
          ? "express"
          : "normal";
      evaluated.push({ mode, status: stored });
      continue;
    }

    const deliveryInfo = r.deliveryInfoRef
      ? deliveryById.get(String(r.deliveryInfoRef)) || null
      : null;
    const outcome = evaluateShipOnTimeOutcome({
      request: r,
      deliveryInfo,
      todayYmd,
    });
    if (outcome.status === "on_time" || outcome.status === "late") {
      evaluated.push({ mode: outcome.mode, status: outcome.status });
    }
  }

  return summarizeShippingOnTimeRates(evaluated);
}

export const getDashboardRiskSummaryData = async ({
  cacheKey,
  riskRequestFilter,
  onTimeRequestFilter = null,
  debug = false,
  role = "requestor",
  populateRelated = false,
  includeRequests = false,
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
      let query = Request.find(riskRequestFilter).select(RISK_SUMMARY_SELECT);

      if (populateRelated) {
        // 전체 populate 대신 위험 상위 항목만 이름 hydrate (아래 hydrateRiskItemNames)
        query = query.populate("deliveryInfoRef", "pickedUpAt deliveredAt");
      }

      const [requests, onTimeRates] = await Promise.all([
        query.lean(),
        computeOnTimeRateSummary(onTimeRequestFilter),
      ]);
      const now = new Date();

      const candidates = [];
      for (const r of requests) {
        if (!r) continue;
        if (isUnmachinableRequest(r)) continue;

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
        if (!RISK_PRE_SHIP_STAGES.includes(stage)) continue;

        candidates.push(r);
      }

      const priorities = await Promise.all(
        candidates.map((r) => computeShippingPriority({ request: r, now })),
      );

      const delayedItems = [];
      const warningItems = [];
      for (let i = 0; i < candidates.length; i += 1) {
        const sp = priorities[i];
        if (!sp) continue;
        if (sp.level === "danger") {
          delayedItems.push({ r: candidates[i], shippingPriority: sp });
        } else if (sp.level === "warning") {
          warningItems.push({ r: candidates[i], shippingPriority: sp });
        }
      }

      const delayedCount = delayedItems.length;
      const warningCount = warningItems.length;

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
            ? `출고 마감(16:00) 기준 처리 지연 위험이 매우 큽니다. ${
                sp?.label || ""
              }`.trim()
            : `출고 마감(16:00)이 임박했습니다. ${sp?.label || ""}`.trim();

        return {
          id: r?.requestId,
          title,
          manufacturer: secondaryText,
          riskLevel: level,
          dueDate: sp?.deadlineAt || null,
          message,
          caseInfos: r?.caseInfos || {},
          manufacturerStage: r?.manufacturerStage || null,
          shippingMode: r?.shippingMode || null,
          finalShipping: r?.finalShipping || null,
          originalShipping: r?.originalShipping || null,
          shippingPriority: sp || undefined,
          __request: r,
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

      if (populateRelated) {
        await hydrateRiskItemNames(riskItems);
        for (const item of riskItems) {
          const r = item.__request;
          if (!r) continue;
          const requestorText =
            r?.requestor?.business || r?.requestor?.name || "";
          const manufacturerText =
            r?.manufacturer?.business ||
            r?.manufacturer?.name ||
            r?.caManufacturer?.business ||
            r?.caManufacturer?.name ||
            "";
          item.manufacturer =
            role === "manufacturer"
              ? requestorText
              : [requestorText, manufacturerText].filter(Boolean).join(" → ");
        }
      }

      for (const item of riskItems) {
        delete item.__request;
      }

      const responseData = {
        ...(includeRequests ? { requests } : { requests: [] }),
        riskSummary: {
          delayedCount,
          warningCount,
          onTimeRate: onTimeRates.onTimeRate,
          expressOnTimeRate: onTimeRates.expressOnTimeRate,
          expressOnTimeCount: onTimeRates.expressOnTimeCount,
          expressEvaluatedCount: onTimeRates.expressEvaluatedCount,
          normalOnTimeRate: onTimeRates.normalOnTimeRate,
          normalOnTimeCount: onTimeRates.normalOnTimeCount,
          normalEvaluatedCount: onTimeRates.normalEvaluatedCount,
          items: riskItems,
        },
      };

      if (!debug && normalizedCacheKey) {
        // 폴링 엔드포인트: 짧은 TTL로 반복 집계 비용을 줄인다.
        setRequestPerfCacheValue(normalizedCacheKey, responseData, 30 * 1000);
      }

      return responseData;
    },
  );

  return built || { requests: [], riskSummary: DEFAULT_RISK_SUMMARY };
};
