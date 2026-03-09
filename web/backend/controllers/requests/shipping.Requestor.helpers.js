import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import { Types } from "mongoose";
import {
  buildRequestorOrgScopeFilter,
  calculateExpressShipYmd,
  normalizeKoreanBusinessDay,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  getDeliveryEtaLeadDays,
  REQUEST_STAGE_GROUPS,
  getRequestorOrgId,
  normalizeRequestStage,
  normalizeRequestStageLabel,
} from "./utils.js";
import { emitCreditBalanceUpdatedToOrganization } from "../../utils/creditRealtime.js";

const __cache = new Map();
const memo = async ({ key, ttlMs, fn }) => {
  const now = Date.now();
  const hit = __cache.get(key);
  if (hit && typeof hit.expiresAt === "number" && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await fn();
  __cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};

const resolveExpressShipLeadDays = () => 1;

export const resolveRequestOrganizationName = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg = request?.requestorOrganizationId || {};
  const extracted = requestorOrg?.extracted || {};
  return (
    requestorOrg?.name ||
    extracted?.companyName ||
    requestor?.organization ||
    request?.caseInfos?.clinicName ||
    requestor?.name ||
    ""
  );
};

export async function ensureShippingPackageForPickup({
  requests,
  actorUserId,
}) {
  const list = Array.isArray(requests) ? requests.filter(Boolean) : [];
  if (!list.length) {
    throw new Error("발송 패키지를 생성할 의뢰가 없습니다.");
  }

  const organizationIds = Array.from(
    new Set(
      list
        .map((request) => {
          const rawOrg = request?.requestorOrganizationId;
          const value =
            rawOrg && typeof rawOrg === "object"
              ? String(rawOrg?._id || rawOrg?.id || "").trim()
              : String(rawOrg || "").trim();
          return Types.ObjectId.isValid(value) ? value : "";
        })
        .filter(Boolean),
    ),
  );
  const organizationNames = Array.from(
    new Set(
      list
        .map((request) => resolveRequestOrganizationName(request))
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (organizationIds.length > 1) {
    throw new Error(
      "우편함 묶음의 조직 정보가 일관되지 않아 발송 박스를 생성할 수 없습니다.",
    );
  }
  if (!organizationIds.length && organizationNames.length > 1) {
    throw new Error(
      "우편함 묶음의 조직명 정보가 일관되지 않아 발송 박스를 생성할 수 없습니다.",
    );
  }

  let organizationId = null;
  if (organizationIds.length === 1) {
    organizationId = new Types.ObjectId(organizationIds[0]);
  } else {
    const fallbackName = organizationNames[0] || "";
    if (!fallbackName) {
      throw new Error(
        "우편함 묶음의 조직 정보를 확인할 수 없어 발송 박스를 생성할 수 없습니다.",
      );
    }
    const orgDoc = await RequestorOrganization.findOne({
      $or: [{ name: fallbackName }, { "extracted.companyName": fallbackName }],
    })
      .select({ _id: 1 })
      .lean();
    if (!orgDoc?._id) {
      throw new Error(
        "우편함 묶음의 조직 정보를 확인할 수 없어 발송 박스를 생성할 수 없습니다.",
      );
    }
    organizationId = new Types.ObjectId(String(orgDoc._id));
  }
  const shipDateYmd = getTodayYmdInKst();

  let pkg = null;
  try {
    pkg = await ShippingPackage.findOneAndUpdate(
      { organizationId, shipDateYmd },
      {
        $setOnInsert: {
          organizationId,
          shipDateYmd,
          createdBy: actorUserId || null,
        },
        $addToSet: {
          requestIds: { $each: list.map((request) => request._id) },
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (error?.code === 11000 || message.includes("E11000")) {
      pkg = await ShippingPackage.findOne({ organizationId, shipDateYmd });
      if (pkg?._id) {
        await ShippingPackage.updateOne(
          { _id: pkg._id },
          {
            $addToSet: {
              requestIds: { $each: list.map((request) => request._id) },
            },
          },
        );
        pkg = await ShippingPackage.findById(pkg._id);
      }
    } else {
      throw error;
    }
  }

  if (!pkg?._id) {
    throw new Error("발송 박스 생성에 실패했습니다.");
  }

  return pkg;
}

export async function chargeShippingFeeOnPickupComplete({
  shippingPackageId,
  actorUserId,
}) {
  const pkgId = String(shippingPackageId || "").trim();
  if (!pkgId || !Types.ObjectId.isValid(pkgId)) return false;

  const pkg = await ShippingPackage.findById(pkgId)
    .select({ _id: 1, organizationId: 1, shippingFeeSupply: 1, requestIds: 1 })
    .lean();
  if (!pkg?._id || !pkg.organizationId) return false;

  const fee = Number(pkg.shippingFeeSupply || 0);
  if (!Number.isFinite(fee) || fee <= 0) return false;

  const uniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee`;
  const chargeResult = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        organizationId: pkg.organizationId,
        userId: actorUserId || null,
        type: "SPEND",
        amount: -fee,
        refType: "SHIPPING_PACKAGE",
        refId: pkg._id,
        uniqueKey,
      },
    },
    { upsert: true },
  );

  if (!chargeResult?.upsertedCount) return false;

  await emitCreditBalanceUpdatedToOrganization({
    organizationId: pkg.organizationId,
    balanceDelta: -fee,
    reason: "shipping_fee_spend",
    refId: pkg._id,
  });

  return true;
}

export async function buildShippingPackagesSummary(req) {
  const daysRaw = req.query.days;
  const days =
    typeof daysRaw === "string" && daysRaw.trim()
      ? Number(daysRaw)
      : typeof daysRaw === "number"
        ? daysRaw
        : 30;

  if (!Number.isFinite(days) || days <= 0) {
    throw Object.assign(new Error("유효한 기간(days) 값을 입력해주세요."), {
      statusCode: 400,
    });
  }

  const orgId = getRequestorOrgId(req);
  if (!orgId) {
    throw Object.assign(new Error("조직 정보가 필요합니다."), {
      statusCode: 400,
    });
  }

  const todayYmd = getTodayYmdInKst();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffYmd = toKstYmd(cutoffDate);

  const packages = await ShippingPackage.find({
    organizationId: orgId,
    shipDateYmd: { $gte: cutoffYmd },
  })
    .select({
      shipDateYmd: 1,
      requestIds: 1,
      shippingFeeSupply: 1,
      createdAt: 1,
    })
    .populate({
      path: "requestIds",
      select: "requestId title caseInfos manufacturerStage createdAt",
    })
    .sort({ createdAt: -1 })
    .lean();

  const packagesByShipDate = new Map();
  for (const pkg of packages) {
    const shipDateYmd = String(pkg?.shipDateYmd || "").trim();
    if (!shipDateYmd) {
      continue;
    }

    const existing = packagesByShipDate.get(shipDateYmd);
    if (!existing) {
      packagesByShipDate.set(shipDateYmd, {
        id: String(pkg?._id || ""),
        shipDateYmd,
        shippingFeeSupply: Number(pkg?.shippingFeeSupply || 0),
        createdAt: pkg?.createdAt,
        requests: Array.isArray(pkg?.requestIds) ? [...pkg.requestIds] : [],
        sourcePackageIds: [String(pkg?._id || "")],
      });
      continue;
    }

    const existingRequestIds = new Set(
      (Array.isArray(existing.requests) ? existing.requests : []).map((req) =>
        String(req?._id || req?.id || req || "").trim(),
      ),
    );
    const nextRequests = Array.isArray(pkg?.requestIds) ? pkg.requestIds : [];
    for (const req of nextRequests) {
      const reqId = String(req?._id || req?.id || req || "").trim();
      if (!reqId || existingRequestIds.has(reqId)) {
        continue;
      }
      existing.requests.push(req);
      existingRequestIds.add(reqId);
    }

    existing.sourcePackageIds.push(String(pkg?._id || ""));
    if (
      new Date(pkg?.createdAt || 0).getTime() >
      new Date(existing.createdAt || 0).getTime()
    ) {
      existing.createdAt = pkg?.createdAt;
      existing.id = String(pkg?._id || existing.id || "");
    }
    existing.shippingFeeSupply = Math.max(
      Number(existing.shippingFeeSupply || 0),
      Number(pkg?.shippingFeeSupply || 0),
    );
  }

  const mergedPackages = Array.from(packagesByShipDate.values()).sort(
    (a, b) => {
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    },
  );

  for (const pkg of mergedPackages) {
    if (
      Array.isArray(pkg.sourcePackageIds) &&
      pkg.sourcePackageIds.length > 1
    ) {
      console.warn(
        "[buildShippingPackagesSummary] duplicate shipping packages collapsed",
        {
          organizationId: String(orgId),
          shipDateYmd: pkg.shipDateYmd,
          sourcePackageIds: pkg.sourcePackageIds,
        },
      );
    }
  }

  const todayPackages = mergedPackages.filter(
    (p) => p.shipDateYmd === todayYmd,
  );
  return {
    today: {
      shipDateYmd: todayYmd,
      packageCount: todayPackages.length,
      shippingFeeSupplyTotal: todayPackages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    },
    lastNDays: {
      days,
      packageCount: mergedPackages.length,
      shippingFeeSupplyTotal: mergedPackages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    },
    items: mergedPackages.map((p) => {
      const requests = Array.isArray(p.requests)
        ? p.requests.map((req) => ({
            id: String(req?._id || req),
            requestId: req?.requestId || "",
            title: req?.title || "",
            caseInfos: req?.caseInfos || {},
            manufacturerStage: req?.manufacturerStage || "",
            timeline: req?.timeline || {},
            createdAt: req?.createdAt,
          }))
        : [];

      return {
        id: String(p._id),
        shipDateYmd: p.shipDateYmd,
        requestCount: requests.length,
        shippingFeeSupply: Number(p.shippingFeeSupply || 0),
        createdAt: p.createdAt,
        requests,
      };
    }),
  };
}

export async function buildShippingEstimate(req) {
  const mode = req.query.mode;
  const maxDiameterRaw = req.query.maxDiameter;
  const maxDiameter =
    typeof maxDiameterRaw === "string" && maxDiameterRaw.trim()
      ? Number(maxDiameterRaw)
      : typeof maxDiameterRaw === "number"
        ? maxDiameterRaw
        : null;

  if (!mode || !["express", "normal"].includes(mode)) {
    throw Object.assign(new Error("유효하지 않은 mode 입니다."), {
      statusCode: 400,
    });
  }

  const todayYmd = getTodayYmdInKst();
  let requestorWeeklyBatchDays = [];
  try {
    const orgId = getRequestorOrgId(req);
    if (orgId && Types.ObjectId.isValid(orgId)) {
      const org = await RequestorOrganization.findById(orgId)
        .select({ "shippingPolicy.weeklyBatchDays": 1 })
        .lean();
      requestorWeeklyBatchDays = Array.isArray(
        org?.shippingPolicy?.weeklyBatchDays,
      )
        ? org.shippingPolicy.weeklyBatchDays
        : [];
    }
  } catch {}

  if (mode === "normal" && requestorWeeklyBatchDays.length === 0) {
    throw Object.assign(
      new Error(
        "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
      ),
      { statusCode: 400 },
    );
  }

  const { calculateInitialProductionSchedule } =
    await import("./production.utils.js");
  const schedule = await calculateInitialProductionSchedule({
    shippingMode: mode,
    maxDiameter,
    requestedAt: new Date(),
    weeklyBatchDays: mode === "normal" ? requestorWeeklyBatchDays : [],
  });
  const pickupYmdRaw = schedule?.scheduledShipPickup
    ? toKstYmd(schedule.scheduledShipPickup)
    : null;

  let estimatedShipYmdRaw;
  if (pickupYmdRaw) {
    estimatedShipYmdRaw = pickupYmdRaw;
  } else {
    const { getManufacturerLeadTimesUtil } =
      await import("../organizations/leadTime.controller.js");
    const manufacturerSettings = await getManufacturerLeadTimesUtil();
    const leadTimes = manufacturerSettings?.leadTimes || {};

    const d =
      typeof maxDiameter === "number" && !isNaN(maxDiameter) ? maxDiameter : 8;
    let diameterKey = "d8";
    if (d <= 6) diameterKey = "d6";
    else if (d <= 8) diameterKey = "d8";
    else if (d <= 10) diameterKey = "d10";
    else diameterKey = "d12";

    const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
    estimatedShipYmdRaw = await addKoreanBusinessDays({
      startYmd: todayYmd,
      days: leadDays,
    });
  }

  return await normalizeKoreanBusinessDay({ ymd: estimatedShipYmdRaw });
}

export async function buildBulkShippingCandidates(req) {
  const requestFilter = await buildRequestorOrgScopeFilter(req);
  const leadDays = await getDeliveryEtaLeadDays();
  const effectiveLeadDays = {
    ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
    ...(leadDays || {}),
  };

  const resolveNormalLeadDays = (maxDiameter) => {
    const d =
      typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
        ? maxDiameter
        : maxDiameter != null && String(maxDiameter).trim()
          ? Number(maxDiameter)
          : null;
    if (d == null || Number.isNaN(d)) return effectiveLeadDays.d10;
    if (d <= 6) return effectiveLeadDays.d6;
    if (d <= 8) return effectiveLeadDays.d8;
    if (d <= 10) return effectiveLeadDays.d10;
    return effectiveLeadDays.d12;
  };

  const todayYmd = getTodayYmdInKst();
  const diameterCache = new Map();

  const getExpressShipYmd = async (maxDiameter) => {
    const key = String(maxDiameter ?? "-");
    if (!diameterCache.has(key)) {
      const raw = await memo({
        key: `expressShip:${todayYmd}:${key}`,
        ttlMs: 6 * 60 * 60 * 1000,
        fn: () => calculateExpressShipYmd({ maxDiameter, baseYmd: todayYmd }),
      });
      const normalized = await memo({
        key: `krbiz:normalize:${raw}`,
        ttlMs: 6 * 60 * 60 * 1000,
        fn: () => normalizeKoreanBusinessDay({ ymd: raw }),
      });
      diameterCache.set(key, normalized);
    }
    return diameterCache.get(key);
  };

  const resolveEstimatedShipYmds = async (r) => {
    const ci = r.caseInfos || {};
    const maxDiameter = ci.maxDiameter;
    const mode = r.shippingMode || "normal";
    const createdYmd = toKstYmd(r.createdAt) || todayYmd;

    const normalize = (ymd) =>
      memo({
        key: `krbiz:normalize:${ymd}`,
        ttlMs: 6 * 60 * 60 * 1000,
        fn: () => normalizeKoreanBusinessDay({ ymd }),
      });

    const addBiz = ({ startYmd, days }) =>
      memo({
        key: `krbiz:add:${startYmd}:${days}`,
        ttlMs: 6 * 60 * 60 * 1000,
        fn: () => addKoreanBusinessDays({ startYmd, days }),
      });

    const clampStart = (ymd) => (ymd < todayYmd ? todayYmd : ymd);

    if (mode === "express") {
      const days = resolveExpressShipLeadDays(maxDiameter);
      const originalRaw = await addBiz({ startYmd: createdYmd, days });
      const nextRaw = await addBiz({ startYmd: clampStart(createdYmd), days });
      return {
        original: await normalize(originalRaw),
        next: await normalize(nextRaw),
      };
    }

    const pickup = r.productionSchedule?.scheduledShipPickup;
    const pickupYmd = pickup ? toKstYmd(pickup) : null;
    if (pickupYmd) {
      const original = await normalize(pickupYmd);
      const next = pickupYmd < todayYmd ? await normalize(todayYmd) : original;
      return { original, next };
    }

    const requestedShipYmd = toKstYmd(r.requestedShipDate);
    if (requestedShipYmd) {
      const original = await normalize(requestedShipYmd);
      const next =
        requestedShipYmd < todayYmd ? await normalize(todayYmd) : original;
      return { original, next };
    }

    const leadDays = resolveNormalLeadDays(maxDiameter);
    const originalRaw = await addBiz({ startYmd: createdYmd, days: leadDays });
    const nextRaw = await addBiz({
      startYmd: clampStart(createdYmd),
      days: leadDays,
    });
    return {
      original: await normalize(originalRaw),
      next: await normalize(nextRaw),
    };
  };

  const requests = await Request.find({
    ...requestFilter,
    manufacturerStage: {
      $in: REQUEST_STAGE_GROUPS.bulkCandidateAll,
    },
  })
    .select(
      "requestId title manufacturerStage caseInfos shippingMode requestedShipDate createdAt timeline.estimatedShipYmd requestor productionSchedule",
    )
    .populate("requestor", "name organization")
    .lean();

  const mapItem = async (r) => {
    const ci = r.caseInfos || {};
    const clinic =
      r.requestor?.organization || r.requestor?.name || req.user?.name || "";
    const maxDiameter =
      typeof ci.maxDiameter === "number"
        ? `${ci.maxDiameter}mm`
        : ci.maxDiameter != null
          ? `${Number(ci.maxDiameter)}mm`
          : "";

    const { original: originalEstimatedShipYmd, next: nextEstimatedShipYmd } =
      await resolveEstimatedShipYmds(r);

    const timeline = r.timeline || {};
    const updates = {};
    if (timeline.originalEstimatedShipYmd !== originalEstimatedShipYmd) {
      updates["timeline.originalEstimatedShipYmd"] = originalEstimatedShipYmd;
    }
    if (timeline.nextEstimatedShipYmd !== nextEstimatedShipYmd) {
      updates["timeline.nextEstimatedShipYmd"] = nextEstimatedShipYmd;
    }
    if (timeline.estimatedShipYmd == null) {
      updates["timeline.estimatedShipYmd"] = originalEstimatedShipYmd;
    }
    if (Object.keys(updates).length > 0) {
      await Request.updateOne({ _id: r._id }, { $set: updates }).exec();
    }

    const estimatedShipYmd = nextEstimatedShipYmd || originalEstimatedShipYmd;
    const stageKey = normalizeRequestStage(r);
    const stageLabel = normalizeRequestStageLabel(r);

    return {
      id: r.requestId,
      mongoId: r._id,
      title: r.title,
      clinic,
      patient: ci.patientName || "",
      tooth: ci.tooth || "",
      diameter: maxDiameter,
      stage: r.manufacturerStage,
      stageKey,
      stageLabel,
      shippingMode: r.shippingMode || "normal",
      requestedShipDate: r.requestedShipDate,
      estimatedShipYmd,
      originalEstimatedShipYmd,
      nextEstimatedShipYmd,
    };
  };

  const [pre, post, waiting] = await Promise.all([
    Promise.all(
      requests
        .filter((r) => REQUEST_STAGE_GROUPS.pre.includes(r.manufacturerStage))
        .map(mapItem),
    ),
    Promise.all(
      requests
        .filter((r) => REQUEST_STAGE_GROUPS.post.includes(r.manufacturerStage))
        .map(mapItem),
    ),
    Promise.all(
      requests
        .filter((r) =>
          REQUEST_STAGE_GROUPS.waiting.includes(r.manufacturerStage),
        )
        .map(mapItem),
    ),
  ]);

  return { pre, post, waiting };
}
