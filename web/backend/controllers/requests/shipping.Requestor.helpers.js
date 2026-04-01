import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
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

const __cache = new Map();
const __inFlight = new Map();
const memo = async ({ key, ttlMs, fn }) => {
  const now = Date.now();
  const hit = __cache.get(key);
  if (hit && typeof hit.expiresAt === "number" && hit.expiresAt > now) {
    return hit.value;
  }

  const existing = __inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve()
    .then(fn)
    .then((value) => {
      __cache.set(key, { value, expiresAt: now + ttlMs });
      return value;
    })
    .finally(() => {
      if (__inFlight.get(key) === promise) {
        __inFlight.delete(key);
      }
    });

  __inFlight.set(key, promise);
  const value = await promise;
  __cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};

const resolveExpressShipLeadDays = () => 1;

export const resolveRequestOrganizationName = (request) => {
  const requestor = request?.requestor || {};
  const requestorOrg =
    request?.requestorBusinessAnchor &&
    typeof request?.requestorBusinessAnchor === "object"
      ? request.requestorBusinessAnchor
      : request?.business &&
          typeof request?.business === "object" &&
          request.business._id
        ? request.business
        : {};
  // SSOT: metadata 사용 (extracted 레거시 제거)
  const metadata = requestorOrg?.metadata || {};
  return (
    requestorOrg?.name ||
    metadata?.companyName ||
    requestor?.business ||
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

  const mailboxAddresses = Array.from(
    new Set(
      list
        .map((request) => String(request?.mailboxAddress || "").trim())
        .filter(Boolean),
    ),
  );

  const businessAnchorIds = Array.from(
    new Set(
      list
        .map((request) => {
          const rawOrg = request?.businessAnchorId;
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

  if (businessAnchorIds.length > 1) {
    throw new Error(
      "우편함 묶음의 조직 정보가 일관되지 않아 발송 박스를 생성할 수 없습니다.",
    );
  }
  if (mailboxAddresses.length !== 1) {
    throw new Error(
      "발송 패키지는 단일 우편함(mailboxAddress) 단위로만 생성할 수 있습니다.",
    );
  }
  if (!businessAnchorIds.length && organizationNames.length > 1) {
    throw new Error(
      "우편함 묶음의 조직명 정보가 일관되지 않아 발송 박스를 생성할 수 없습니다.",
    );
  }

  if (!businessAnchorIds.length) {
    throw new Error(
      "우편함 묶음의 businessAnchorId가 없어 발송 박스를 생성할 수 없습니다.",
    );
  }
  const businessAnchorId = new Types.ObjectId(businessAnchorIds[0]);
  const shipDateYmd = getTodayYmdInKst();
  const mailboxAddress = mailboxAddresses[0];

  let pkg = await ShippingPackage.findOneAndUpdate(
    { businessAnchorId, shipDateYmd, mailboxAddress },
    {
      $setOnInsert: {
        businessAnchorId,
        shipDateYmd,
        mailboxAddress,
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

  if (!pkg?._id) {
    throw new Error("발송 박스 생성에 실패했습니다.");
  }

  return pkg;
}

async function resolveBusinessAnchorId(req) {
  const businessAnchorId = getRequestorOrgId(req);
  if (businessAnchorId && Types.ObjectId.isValid(businessAnchorId)) {
    return businessAnchorId;
  }

  const userId = req?.user?._id;
  if (!userId) return "";

  const business = await BusinessAnchor.findOne({
    $or: [
      { primaryContactUserId: userId },
      { owners: userId },
      { members: userId },
      {
        "joinRequests.user": userId,
        "joinRequests.status": "approved",
      },
    ],
  })
    .select({ businessAnchorId: 1 })
    .lean();

  if (business?._id) {
    return String(business._id);
  }

  const requestWithBusinessAnchor = await Request.findOne({ requestor: userId })
    .select({ businessAnchorId: 1 })
    .lean();

  const requestBusinessAnchorId = requestWithBusinessAnchor?.businessAnchorId;
  if (
    requestBusinessAnchorId &&
    Types.ObjectId.isValid(requestBusinessAnchorId)
  ) {
    return String(requestBusinessAnchorId);
  }

  return "";
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

  const businessAnchorId = await resolveBusinessAnchorId(req);
  if (!businessAnchorId) {
    throw Object.assign(new Error("조직 정보가 필요합니다."), {
      statusCode: 400,
    });
  }

  const todayYmd = getTodayYmdInKst();
  // KST 기준 N일 전
  const todayKst = new Date(`${todayYmd}T00:00:00+09:00`);
  todayKst.setDate(todayKst.getDate() - days);
  const cutoffYmd = toKstYmd(todayKst);

  const packages = await ShippingPackage.find({
    businessAnchorId: new Types.ObjectId(businessAnchorId),
    shipDateYmd: { $gte: cutoffYmd },
  })
    .select({
      _id: 1,
      shipDateYmd: 1,
      mailboxAddress: 1,
      requestIds: 1,
      shippingFeeSupply: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  const todayPackageRequestIds = Array.from(
    new Set(
      (Array.isArray(packages) ? packages : [])
        .filter((pkg) => String(pkg?.shipDateYmd || "").trim() === todayYmd)
        .flatMap((pkg) =>
          Array.isArray(pkg?.requestIds)
            ? pkg.requestIds
                .map((id) => String(id || "").trim())
                .filter(Boolean)
            : [],
        ),
    ),
  );

  const todayRequestDocMap = todayPackageRequestIds.length
    ? new Map(
        (
          await Request.find({
            _id: {
              $in: todayPackageRequestIds
                .filter((id) => Types.ObjectId.isValid(id))
                .map((id) => new Types.ObjectId(id)),
            },
          })
            .select({
              _id: 1,
              requestId: 1,
              title: 1,
              caseInfos: 1,
              manufacturerStage: 1,
              timeline: 1,
              createdAt: 1,
            })
            .lean()
        ).map((req) => [String(req?._id || ""), req]),
      )
    : new Map();

  const normalizedPackages = (Array.isArray(packages) ? packages : []).map(
    (pkg) => {
      const shipDateYmd = String(pkg?.shipDateYmd || "").trim();
      const requests =
        shipDateYmd === todayYmd && Array.isArray(pkg?.requestIds)
          ? pkg.requestIds
              .map((reqId) =>
                todayRequestDocMap.get(String(reqId || "").trim()),
              )
              .filter(Boolean)
              .map((req) => ({
                id: String(req?._id || ""),
                requestId: req?.requestId || "",
                title: req?.title || "",
                caseInfos: req?.caseInfos || {},
                manufacturerStage: req?.manufacturerStage || "",
                timeline: req?.timeline || {},
                createdAt: req?.createdAt,
              }))
              .sort(
                (a, b) =>
                  new Date(b?.createdAt || 0).getTime() -
                  new Date(a?.createdAt || 0).getTime(),
              )
          : [];

      return {
        id: String(pkg?._id || ""),
        shipDateYmd,
        mailboxAddress: String(pkg?.mailboxAddress || "").trim(),
        requestCount: Array.isArray(pkg?.requestIds)
          ? pkg.requestIds.length
          : 0,
        shippingFeeSupply: Number(pkg?.shippingFeeSupply || 0),
        createdAt: pkg?.createdAt,
        requests,
      };
    },
  );

  const todayPackages = normalizedPackages.filter(
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
      packageCount: normalizedPackages.length,
      shippingFeeSupplyTotal: normalizedPackages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    },
    items: normalizedPackages,
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

  const { calculateInitialProductionSchedule } =
    await import("./production.utils.js");
  const schedule = await calculateInitialProductionSchedule({
    maxDiameter,
    requestedAt: new Date(),
  });
  const pickupYmdRaw = schedule?.scheduledShipPickup
    ? toKstYmd(schedule.scheduledShipPickup)
    : null;

  let estimatedShipYmdRaw;
  if (pickupYmdRaw) {
    estimatedShipYmdRaw = pickupYmdRaw;
  } else {
    const { getManufacturerLeadTimesUtil } =
      await import("../businesses/leadTime.controller.js");
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
  return buildBulkShippingCandidatesByFilter({ requestFilter });
}

export async function buildBulkShippingCandidatesForBusinessAnchorId(
  businessAnchorId,
) {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) {
    return { pre: [], post: [], waiting: [] };
  }

  return buildBulkShippingCandidatesByFilter({
    requestFilter: {
      businessAnchorId: new Types.ObjectId(anchorId),
    },
  });
}

async function buildBulkShippingCandidatesByFilter({ requestFilter }) {
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
  const estimatedShipYmdsBySignature = new Map();

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
    const pickup = r.productionSchedule?.scheduledShipPickup;
    const pickupYmd = pickup ? toKstYmd(pickup) : null;
    const requestedShipYmd = toKstYmd(r.requestedShipDate);
    const signature = [
      mode,
      String(maxDiameter ?? ""),
      createdYmd,
      pickupYmd || "",
      requestedShipYmd || "",
    ].join(":");

    const cachedSignature = estimatedShipYmdsBySignature.get(signature);
    if (cachedSignature) {
      return cachedSignature;
    }

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
      const result = {
        original: await normalize(originalRaw),
        next: await normalize(nextRaw),
      };
      estimatedShipYmdsBySignature.set(signature, result);
      return result;
    }

    if (pickupYmd) {
      const original = await normalize(pickupYmd);
      const next = pickupYmd < todayYmd ? await normalize(todayYmd) : original;
      const result = { original, next };
      estimatedShipYmdsBySignature.set(signature, result);
      return result;
    }

    if (requestedShipYmd) {
      const original = await normalize(requestedShipYmd);
      const next =
        requestedShipYmd < todayYmd ? await normalize(todayYmd) : original;
      const result = { original, next };
      estimatedShipYmdsBySignature.set(signature, result);
      return result;
    }

    const leadDays = resolveNormalLeadDays(maxDiameter);
    const originalRaw = await addBiz({ startYmd: createdYmd, days: leadDays });
    const nextRaw = await addBiz({
      startYmd: clampStart(createdYmd),
      days: leadDays,
    });
    const result = {
      original: await normalize(originalRaw),
      next: await normalize(nextRaw),
    };
    estimatedShipYmdsBySignature.set(signature, result);
    return result;
  };

  const requests = await Request.find({
    ...requestFilter,
    manufacturerStage: {
      $in: REQUEST_STAGE_GROUPS.bulkCandidateAll,
    },
  })
    .select(
      "requestId title manufacturerStage caseInfos shippingMode requestedShipDate createdAt productionSchedule",
    )
    .lean();

  const mapItem = async (r) => {
    const ci = r.caseInfos || {};
    const clinic =
      (typeof ci.clinicName === "string" && ci.clinicName.trim()) ||
      (typeof ci.hospital === "string" && ci.hospital.trim()) ||
      "";
    const maxDiameter =
      typeof ci.maxDiameter === "number"
        ? `${ci.maxDiameter}mm`
        : ci.maxDiameter != null
          ? `${Number(ci.maxDiameter)}mm`
          : "";

    const { original: originalEstimatedShipYmd, next: nextEstimatedShipYmd } =
      await resolveEstimatedShipYmds(r);

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

  const mapped = await Promise.all(
    requests.map(async (request) => ({
      request,
      item: await mapItem(request),
    })),
  );

  const pre = [];
  const post = [];
  const waiting = [];

  for (const row of mapped) {
    const stage = row?.request?.manufacturerStage;
    if (REQUEST_STAGE_GROUPS.pre.includes(stage)) {
      pre.push(row.item);
      continue;
    }
    if (REQUEST_STAGE_GROUPS.post.includes(stage)) {
      post.push(row.item);
      continue;
    }
    if (REQUEST_STAGE_GROUPS.waiting.includes(stage)) {
      waiting.push(row.item);
    }
  }

  return { pre, post, waiting };
}
