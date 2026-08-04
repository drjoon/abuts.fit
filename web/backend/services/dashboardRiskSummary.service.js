// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/requests/dashboard.controller.js
// - web/backend/controllers/requests/shippingPriority.utils.js
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
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

export const getDashboardRiskSummaryData = async ({
  cacheKey,
  riskRequestFilter,
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

      const requests = await query.lean();
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
          onTimeRate,
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
