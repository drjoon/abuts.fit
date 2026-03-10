import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import LotCounter from "../../models/lotCounter.model.js";
import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  getThisMonthStartYmdInKst,
  getTodayMidnightUtcInKst,
  getLast30DaysRangeUtc,
  normalizeKoreanBusinessDay,
  prevKoreanBusinessDayYmd,
  toKstYmd,
  ymdToMmDd,
} from "../../utils/krBusinessDays.js";
import { normalizeImplantFields } from "../../utils/implantCanonical.js";

export {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  getThisMonthStartYmdInKst,
  getTodayMidnightUtcInKst,
  getLast30DaysRangeUtc,
  normalizeKoreanBusinessDay,
  prevKoreanBusinessDayYmd,
  toKstYmd,
  ymdToMmDd,
};

export const DEFAULT_DELIVERY_ETA_LEAD_DAYS = {
  d6: 1,
  d8: 1,
  d10: 4,
  d12: 4,
};

export const SHIPPING_WORKFLOW_CODES = {
  NONE: "none",
  PRINTED: "printed",
  ACCEPTED: "accepted",
  PICKED_UP: "picked_up",
  COMPLETED: "completed",
  CANCELED: "canceled",
  ERROR: "error",
};

export const SHIPPING_WORKFLOW_LABELS = {
  [SHIPPING_WORKFLOW_CODES.NONE]: "미처리",
  [SHIPPING_WORKFLOW_CODES.PRINTED]: "출력",
  [SHIPPING_WORKFLOW_CODES.ACCEPTED]: "접수",
  [SHIPPING_WORKFLOW_CODES.PICKED_UP]: "집하",
  [SHIPPING_WORKFLOW_CODES.COMPLETED]: "완료",
  [SHIPPING_WORKFLOW_CODES.CANCELED]: "취소",
  [SHIPPING_WORKFLOW_CODES.ERROR]: "에러",
};

export function resolveShippingWorkflowState({ requestLike, deliveryInfo }) {
  const saved =
    requestLike?.shippingWorkflow &&
    typeof requestLike.shippingWorkflow === "object"
      ? requestLike.shippingWorkflow
      : {};
  const tracking =
    deliveryInfo?.tracking && typeof deliveryInfo.tracking === "object"
      ? deliveryInfo.tracking
      : {};
  const statusCode = String(tracking?.lastStatusCode || "").trim();
  const statusText = String(tracking?.lastStatusText || "").trim();
  const printedAt =
    requestLike?.shippingLabelPrinted?.printedAt || saved?.printedAt || null;
  const acceptedAt = saved?.acceptedAt || null;
  const pickedUpAt = deliveryInfo?.pickedUpAt || saved?.pickedUpAt || null;
  const completedAt = deliveryInfo?.deliveredAt || saved?.completedAt || null;
  const erroredAt = saved?.erroredAt || null;
  const canceledAt =
    saved?.canceledAt ||
    (statusCode === "03" || statusText === "예약취소" ? new Date() : null);
  const hasTrackingCancelSignal =
    statusCode === "03" || statusText === "예약취소";

  let code = String(saved?.code || "").trim();
  if (completedAt) code = SHIPPING_WORKFLOW_CODES.COMPLETED;
  else if (erroredAt || code === SHIPPING_WORKFLOW_CODES.ERROR) {
    code = SHIPPING_WORKFLOW_CODES.ERROR;
  } else if (statusCode === "11" || pickedUpAt) {
    code = SHIPPING_WORKFLOW_CODES.PICKED_UP;
  } else if (acceptedAt || statusCode || statusText) {
    code = SHIPPING_WORKFLOW_CODES.ACCEPTED;
  } else if (printedAt || requestLike?.shippingLabelPrinted?.printed) {
    code = SHIPPING_WORKFLOW_CODES.PRINTED;
  } else if (hasTrackingCancelSignal || canceledAt) {
    code = SHIPPING_WORKFLOW_CODES.CANCELED;
  } else {
    code = SHIPPING_WORKFLOW_CODES.NONE;
  }

  return {
    code,
    label: SHIPPING_WORKFLOW_LABELS[code] || SHIPPING_WORKFLOW_LABELS.none,
    printedAt: printedAt || null,
    acceptedAt: acceptedAt || null,
    pickedUpAt: pickedUpAt || null,
    completedAt: completedAt || null,
    erroredAt: erroredAt || null,
    canceledAt: canceledAt || null,
    trackingStatusCode: statusCode || null,
    trackingStatusText: statusText || null,
    updatedAt:
      saved?.updatedAt ||
      completedAt ||
      canceledAt ||
      pickedUpAt ||
      acceptedAt ||
      printedAt ||
      null,
    source: String(saved?.source || "").trim() || null,
  };
}

export function applyShippingWorkflowState(requestLike, patch = {}) {
  if (!requestLike || typeof requestLike !== "object") return requestLike;
  const prev =
    requestLike.shippingWorkflow &&
    typeof requestLike.shippingWorkflow === "object"
      ? requestLike.shippingWorkflow
      : {};
  const code = String(
    patch?.code || prev?.code || SHIPPING_WORKFLOW_CODES.NONE,
  ).trim();
  const next = {
    ...prev,
    ...patch,
    code,
    label:
      String(patch?.label || "").trim() ||
      SHIPPING_WORKFLOW_LABELS[code] ||
      SHIPPING_WORKFLOW_LABELS.none,
    updatedAt: patch?.updatedAt || prev?.updatedAt || new Date(),
  };
  requestLike.shippingWorkflow = next;
  return next;
}

export function getRequestorOrgId(req) {
  const raw = req?.user?.businessId;
  return raw ? String(raw) : "";
}

export function buildRequestorOrgFilter(req) {
  if (req?.user?.role !== "requestor") return {};
  const orgId = getRequestorOrgId(req);
  if (orgId && Types.ObjectId.isValid(orgId)) {
    return { requestorBusinessId: new Types.ObjectId(orgId) };
  }
  return { requestor: req.user._id };
}

export async function buildRequestorOrgScopeFilter(req) {
  if (req?.user?.role !== "requestor") return {};

  const orgId = getRequestorOrgId(req);
  if (!orgId || !Types.ObjectId.isValid(orgId)) {
    return { requestor: req.user._id };
  }

  const org = await RequestorOrganization.findById(orgId)
    .select({ owner: 1, owners: 1, members: 1 })
    .lean();

  if (!org) {
    return { requestor: req.user._id };
  }

  const ownerId = String(org.owner || "");
  const ownerIds = Array.isArray(org.owners) ? org.owners.map(String) : [];
  const memberIdsRaw = Array.isArray(org.members) ? org.members : [];
  const memberIds = [ownerId, ...ownerIds, ...memberIdsRaw]
    .map((id) => String(id))
    .filter((id) => Types.ObjectId.isValid(id));

  const memberObjectIds = memberIds.map((id) => new Types.ObjectId(id));
  const orgObjectId = new Types.ObjectId(orgId);

  return {
    $or: [
      { requestorBusinessId: orgObjectId },
      { requestor: { $in: memberObjectIds } },
    ],
  };
}

export function normalizeRequestStage(requestLike) {
  const stage = String(requestLike?.manufacturerStage || "");

  if (stage === "취소") return "cancel";

  if (["tracking", "추적관리"].includes(stage)) {
    return "tracking";
  }
  if (["shipping", "포장.발송"].includes(stage)) {
    return "shipping";
  }
  if (["packing", "세척.패킹"].includes(stage)) {
    return "packing";
  }
  if (["machining", "가공"].includes(stage)) {
    return "machining";
  }
  if (["cam", "CAM"].includes(stage)) {
    return "cam";
  }
  if (["request", "의뢰"].includes(stage)) {
    return "request";
  }
  return "request";
}

export function normalizeRequestStageLabel(requestLike) {
  const s = normalizeRequestStage(requestLike);
  if (s === "request") return "의뢰";
  if (s === "cam") return "CAM";
  if (s === "machining") return "가공";
  if (s === "packing") return "세척.패킹";
  if (s === "shipping") return "포장.발송";
  if (s === "tracking") return "추적관리";
  if (s === "cancel") return "취소";
  return "의뢰";
}

export const REQUEST_STAGE_GROUPS = {
  pre: ["의뢰", "CAM"],
  post: ["가공", "세척.패킹"],
  waiting: ["포장.발송"],
  bulkCandidateAll: ["의뢰", "CAM", "가공", "세척.패킹", "포장.발송"],
  bulkCreateEligible: ["CAM", "가공", "세척.패킹", "포장.발송"],
};

export const REQUEST_STAGE_ORDER = {
  request: 0,
  의뢰: 0,
  cam: 1,
  CAM: 1,
  machining: 2,
  가공: 2,
  packing: 3,
  "세척.패킹": 3,
  shipping: 3,
  "포장.발송": 3,
  tracking: 4,
  추적관리: 4,
};

export function getRequestStageOrder(requestLike) {
  const normalized = normalizeRequestStage(requestLike);
  if (normalized === "cancel") return -1;
  const stage = String(requestLike?.manufacturerStage || "").trim();
  return REQUEST_STAGE_ORDER[stage] ?? REQUEST_STAGE_ORDER[normalized] ?? 0;
}

export async function canAccessRequestAsRequestor(req, requestDoc) {
  if (!req?.user || req.user.role !== "requestor") return false;
  if (!requestDoc) return false;

  const myId = String(req.user._id);
  const myOrgId = getRequestorOrgId(req);
  const reqOrgId = requestDoc.requestorBusinessId
    ? String(requestDoc.requestorBusinessId)
    : "";

  // 1. 의뢰 생성자가 본인인 경우 항상 접근 가능
  const populatedReqUser = requestDoc.requestor || null;
  const reqUserId = populatedReqUser?._id
    ? String(populatedReqUser._id)
    : requestDoc.requestor
      ? String(requestDoc.requestor)
      : "";
  if (reqUserId && reqUserId === myId) {
    return true;
  }

  // 2. 조직이 같은 경우 접근 허용
  if (!myOrgId || !Types.ObjectId.isValid(myOrgId)) {
    return false;
  }

  // 의뢰의 사업자 ID 확인 (직접 저장된 것 또는 requestor.businessId)
  const populatedReqUserOrgId = populatedReqUser?.businessId
    ? String(populatedReqUser.businessId)
    : "";
  const targetOrgId = reqOrgId || populatedReqUserOrgId;

  if (!targetOrgId || myOrgId !== targetOrgId) {
    return false;
  }

  return true;
}

export async function formatEtaLabelFromNow(days) {
  const d = typeof days === "number" && !Number.isNaN(days) ? days : 0;
  const todayYmd = getTodayYmdInKst();
  const etaYmd = await addKoreanBusinessDays({ startYmd: todayYmd, days: d });
  return ymdToMmDd(etaYmd);
}

export async function calculateExpressShipYmd({ maxDiameter, baseYmd }) {
  const todayYmd =
    typeof baseYmd === "string" && baseYmd.trim()
      ? baseYmd.trim()
      : getTodayYmdInKst();

  // Use manufacturer lead times for express shipping
  const leadDays = await getDeliveryEtaLeadDays();
  const d =
    typeof maxDiameter === "number" && !isNaN(maxDiameter) ? maxDiameter : 8;
  let diameterKey = "d8";
  if (d <= 6) diameterKey = "d6";
  else if (d <= 8) diameterKey = "d8";
  else if (d <= 10) diameterKey = "d10";
  else diameterKey = "d12";

  const days = leadDays?.[diameterKey] ?? 1;
  return addKoreanBusinessDays({ startYmd: todayYmd, days });
}

export async function getDeliveryEtaLeadDays() {
  try {
    const { getManufacturerLeadTimesUtil } =
      await import("../organizations/leadTime.controller.js");
    const manufacturerSettings = await getManufacturerLeadTimesUtil();
    const leadTimes = manufacturerSettings?.leadTimes || {};

    // Convert {d6: {min, max}, ...} to {d6: max, d8: max, ...} for backward compatibility
    const result = {};
    ["d6", "d8", "d10", "d12"].forEach((key) => {
      const entry = leadTimes?.[key];
      result[key] =
        entry?.maxBusinessDays ?? DEFAULT_DELIVERY_ETA_LEAD_DAYS[key];
    });
    return result;
  } catch (error) {
    console.error("[getDeliveryEtaLeadDays] error:", error);
    return DEFAULT_DELIVERY_ETA_LEAD_DAYS;
  }
}

export async function normalizeCaseInfosImplantFields(
  caseInfos,
  strict = true,
) {
  const ci = caseInfos && typeof caseInfos === "object" ? { ...caseInfos } : {};

  const manufacturer = (ci.implantManufacturer || "").trim();
  const brand = (ci.implantBrand || "").trim();
  const family = (ci.implantFamily || "").trim();
  const type = (ci.implantType || "").trim();

  if (strict) {
    const missing = [];
    if (!manufacturer) missing.push("implantManufacturer");
    if (!brand) missing.push("implantBrand");
    if (!family) missing.push("implantFamily");
    if (!type) missing.push("implantType");
    if (missing.length > 0) {
      throw new Error(`Missing required implant fields: ${missing.join(", ")}`);
    }
  }

  return normalizeImplantFields({
    ...ci,
    implantManufacturer: manufacturer,
    implantBrand: brand,
    implantFamily: family,
    implantType: type,
  });
}

function inferDiameterGroupFromDiameter(diameter) {
  const d = Number(diameter);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (d <= 6) return "6";
  if (d <= 8) return "8";
  if (d <= 10) return "10";
  return "12";
}

function normalizeProductionScheduleDiameter(obj) {
  if (!obj) return obj;
  const schedule =
    typeof obj.productionSchedule === "object" && obj.productionSchedule
      ? { ...obj.productionSchedule }
      : {};
  const ci = obj.caseInfos || {};
  const candidates = [schedule.diameter, ci.camDiameter, ci.maxDiameter]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  const rawDiameter = candidates.length ? candidates[0] : null;
  const group = inferDiameterGroupFromDiameter(rawDiameter) || "8";
  const groupToNumber = (g) => {
    if (g === "6") return 6;
    if (g === "8") return 8;
    if (g === "10") return 10;
    return 12;
  };
  const normalizedDiameter = groupToNumber(group);

  schedule.diameter = normalizedDiameter;
  schedule.diameterGroup = group;
  obj.productionSchedule = schedule;
  return obj;
}

function canonicalizeLotNumberValue(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return value.replace(/^CAP/i, "CA");
}

function deriveDeliveryMetaFields(deliveryInfo) {
  if (!deliveryInfo || typeof deliveryInfo !== "object") {
    return {
      wasPickedUp: false,
      pickupStatusCode: null,
      pickupStatusText: null,
      pickupCanceled: false,
      delivered: false,
    };
  }

  const statusCodeRaw = deliveryInfo?.tracking?.lastStatusCode;
  const statusTextRaw = deliveryInfo?.tracking?.lastStatusText;
  const pickupStatusCode = statusCodeRaw
    ? String(statusCodeRaw).trim() || null
    : null;
  const pickupStatusText = statusTextRaw
    ? String(statusTextRaw).trim() || null
    : null;
  const wasPickedUp = Boolean(
    deliveryInfo?.trackingNumber || deliveryInfo?.shippedAt,
  );
  const pickupCanceled =
    pickupStatusText === "예약취소" || pickupStatusCode === "03";
  const delivered = Boolean(deliveryInfo?.deliveredAt);

  return {
    wasPickedUp,
    pickupStatusCode,
    pickupStatusText,
    pickupCanceled,
    delivered,
  };
}

export async function normalizeRequestForResponse(requestDoc) {
  if (!requestDoc) return requestDoc;
  const obj =
    typeof requestDoc.toObject === "function"
      ? requestDoc.toObject()
      : requestDoc;
  const ci = obj.caseInfos || {};
  obj.caseInfos = await normalizeCaseInfosImplantFields(ci, false);
  normalizeProductionScheduleDiameter(obj);
  const requestorOrgRaw = obj?.requestorBusinessId;
  const requestorOrgId = (() => {
    if (!requestorOrgRaw) return "";
    if (
      typeof requestorOrgRaw === "object" &&
      !Array.isArray(requestorOrgRaw) &&
      requestorOrgRaw._id
    ) {
      return String(requestorOrgRaw._id);
    }
    return String(requestorOrgRaw);
  })();
  if (requestorOrgId && Types.ObjectId.isValid(requestorOrgId)) {
    const requestorOrgDoc = await RequestorOrganization.findById(requestorOrgId)
      .select({ name: 1, extracted: 1 })
      .lean();
    if (requestorOrgDoc) {
      const extracted =
        requestorOrgDoc.extracted &&
        typeof requestorOrgDoc.extracted === "object"
          ? requestorOrgDoc.extracted
          : undefined;
      const orgName =
        typeof requestorOrgDoc.name === "string"
          ? requestorOrgDoc.name.trim()
          : "";
      const companyName =
        typeof extracted?.companyName === "string"
          ? extracted.companyName.trim()
          : "";
      obj.requestorOrganization = {
        _id: requestorOrgId,
        name: orgName || companyName || undefined,
        extracted,
      };
    }
  }
  if (obj?.lotNumber && typeof obj.lotNumber === "object") {
    const valueRaw = canonicalizeLotNumberValue(obj.lotNumber.value);
    if (valueRaw) {
      obj.lotNumber.value = valueRaw;
    }
  }

  const deliveryInfo =
    obj?.deliveryInfoRef && typeof obj.deliveryInfoRef === "object"
      ? obj.deliveryInfoRef
      : null;
  obj.shippingWorkflow = resolveShippingWorkflowState({
    requestLike: obj,
    deliveryInfo,
  });
  if (deliveryInfo) {
    const deliveryMeta = deriveDeliveryMetaFields(deliveryInfo);
    obj.wasPickedUp = deliveryMeta.wasPickedUp;
    obj.pickupStatusCode = deliveryMeta.pickupStatusCode;
    obj.pickupStatusText = deliveryMeta.pickupStatusText;
    obj.pickupCanceled = deliveryMeta.pickupCanceled;
    obj.deliveryMeta = deliveryMeta;
  }

  return obj;
}

export function ensureReviewByStageDefaults(request) {
  if (!request) return;
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
  const review = request.caseInfos.reviewByStage;
  review.request = review.request || { status: "PENDING" };
  review.cam = review.cam || { status: "PENDING" };
  review.machining = review.machining || { status: "PENDING" };
  review.packing = review.packing || { status: "PENDING" };
  review.shipping = review.shipping || { status: "PENDING" };
  review.tracking = review.tracking || { status: "PENDING" };
}

export function bumpRollbackCount(request, stageKey) {
  if (!request) return;
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.rollbackCounts = request.caseInfos.rollbackCounts || {};
  const key = String(stageKey || "").trim();
  if (!key) return;
  request.caseInfos.rollbackCounts[key] =
    Number(request.caseInfos.rollbackCounts[key] || 0) + 1;
}

async function nextLotLetters() {
  const counter = await LotCounter.findOneAndUpdate(
    { key: "global" },
    { $inc: { seq: 1 }, $setOnInsert: { key: "global" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  const seqRaw = typeof counter?.seq === "number" ? counter.seq : 0;
  const total = 26 * 26 * 26;
  const seq = ((seqRaw % total) + total) % total;
  const toLetters = (n) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const a = Math.floor(n / (26 * 26)) % 26;
    const b = Math.floor(n / 26) % 26;
    const c = n % 26;
    return `${alphabet[a]}${alphabet[b]}${alphabet[c]}`;
  };
  return toLetters(Math.max(seq, 0));
}

function getWorkTypePrefix(requestDoc, { defaultPrefix }) {
  const raw = String(requestDoc?.caseInfos?.workType || "")
    .trim()
    .toLowerCase();
  if (raw === "crown") return "CR";
  return defaultPrefix;
}

export async function ensureLotNumberForMachining(requestDoc) {
  if (!requestDoc) return;

  requestDoc.lotNumber = requestDoc.lotNumber || {};
  const existingValue = canonicalizeLotNumberValue(requestDoc.lotNumber.value);
  if (existingValue) {
    requestDoc.lotNumber.value = existingValue;
    return;
  }

  // 로트 규칙(CA, 크라운은 CR): PREFIX + YYMMDD + "-" + 26진 3자리 (AAA, AAB, ... ZZZ 이후 다시 AAA)
  const todayYmd = getTodayYmdInKst(); // YYYY-MM-DD
  const yyMMdd = todayYmd.replace(/-/g, "").slice(2); // YYMMDD

  const letters = await nextLotLetters();
  const prefix = getWorkTypePrefix(requestDoc, { defaultPrefix: "CA" });
  requestDoc.lotNumber.value = `${prefix}${yyMMdd}-${letters}`;
}

export async function ensureFinishedLotNumberForPacking(requestDoc) {
  if (!requestDoc) return;

  await ensureLotNumberForMachining(requestDoc);
}

export async function computePriceForRequest({
  requestorId,
  requestorOrgId,
  clinicName,
  patientName,
  tooth,
  forceNewOrderPricing = false,
}) {
  const now = new Date();

  const scopeFilter =
    requestorOrgId && Types.ObjectId.isValid(String(requestorOrgId))
      ? { requestorBusinessId: new Types.ObjectId(String(requestorOrgId)) }
      : { requestor: requestorId };

  const BASE_UNIT_PRICE = 15000;
  const REMAKE_FIXED_PRICE = 10000;
  const NEW_USER_FIXED_PRICE = 10000;
  const DISCOUNT_PER_ORDER = 20;
  const MAX_DISCOUNT = 5000;

  // 0) 리메이크 기준(90일): 동일 치과+환자+치아에 대해 직전 의뢰가 있으면 고정가
  const remakeCutoff = new Date(now);
  remakeCutoff.setDate(remakeCutoff.getDate() - 90);
  const existing = await Request.findOne({
    ...scopeFilter,
    "caseInfos.patientName": patientName,
    "caseInfos.tooth": tooth,
    "caseInfos.clinicName": clinicName,
    "caseInfos.implantBrand": { $exists: true, $ne: "" },
    manufacturerStage: { $ne: "취소" },
    createdAt: { $gte: remakeCutoff },
  })
    .select({ _id: 1 })
    .lean();

  if (existing && !forceNewOrderPricing) {
    return {
      baseAmount: REMAKE_FIXED_PRICE,
      discountAmount: 0,
      amount: REMAKE_FIXED_PRICE,
      currency: "KRW",
      rule: "remake_fixed_10000",
      discountMeta: {
        last30DaysOrders: 0,
        referralLast30DaysOrders: 0,
        discountPerOrder: DISCOUNT_PER_ORDER,
        maxDiscount: MAX_DISCOUNT,
      },
      quotedAt: now,
    };
  }

  // 2) 신규 90일 고정가: 가입일 기준 90일 내 -> 10,000원 고정
  // 조직 단위 정책이므로, 조직이 있으면 조직 owner의 가입일을 기준으로 한다.
  // updatedAt은 운영 중 자주 갱신될 수 있어 기준일로 사용하지 않는다.
  const baseDate = await (async () => {
    if (requestorOrgId && Types.ObjectId.isValid(String(requestorOrgId))) {
      const org = await RequestorOrganization.findById(String(requestorOrgId))
        .select({ owner: 1 })
        .lean();
      const ownerId = org?.owner ? String(org.owner) : "";
      if (ownerId && Types.ObjectId.isValid(ownerId)) {
        const owner = await User.findById(ownerId)
          .select({ createdAt: 1, approvedAt: 1 })
          .lean();
        return owner?.approvedAt || owner?.createdAt || null;
      }
    }

    const user = await User.findById(requestorId)
      .select({ createdAt: 1, approvedAt: 1 })
      .lean();
    return user?.approvedAt || user?.createdAt || null;
  })();
  if (baseDate) {
    const newUserCutoff = new Date(baseDate);
    newUserCutoff.setDate(newUserCutoff.getDate() + 90);
    if (now < newUserCutoff) {
      return {
        baseAmount: NEW_USER_FIXED_PRICE,
        discountAmount: 0,
        amount: NEW_USER_FIXED_PRICE,
        currency: "KRW",
        rule: "new_user_90days_fixed_10000",
        discountMeta: {
          last30DaysOrders: 0,
          referralLast30DaysOrders: 0,
          discountPerOrder: DISCOUNT_PER_ORDER,
          maxDiscount: MAX_DISCOUNT,
        },
        quotedAt: now,
      };
    }
  }

  // 3) 최근 30일 주문량 할인(리퍼럴 합산은 아직 스키마가 없어 0으로 처리)
  const last30Cutoff = new Date(now);
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);
  const last30DaysOrders = await Request.countDocuments({
    ...scopeFilter,
    manufacturerStage: { $ne: "취소" },
    createdAt: { $gte: last30Cutoff },
  });

  // 추천인 합산: 내가 추천한(=referredByUserId가 나인) 유저들의 최근 30일 주문량을 합산
  const referredUsers = await User.find({
    referredByUserId: requestorId,
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  const referredUserIds = referredUsers.map((u) => u._id).filter(Boolean);

  const referralLast30DaysOrders = referredUserIds.length
    ? await Request.countDocuments({
        requestor: { $in: referredUserIds },
        manufacturerStage: { $ne: "취소" },
        createdAt: { $gte: last30Cutoff },
      })
    : 0;
  const totalOrders = last30DaysOrders + referralLast30DaysOrders;
  const discountAmount = Math.min(
    totalOrders * DISCOUNT_PER_ORDER,
    MAX_DISCOUNT,
  );
  const amount = Math.max(0, BASE_UNIT_PRICE - discountAmount);

  return {
    baseAmount: BASE_UNIT_PRICE,
    discountAmount,
    amount,
    currency: "KRW",
    rule: discountAmount > 0 ? "volume_discount_last30days" : "base_price",
    discountMeta: {
      last30DaysOrders,
      referralLast30DaysOrders,
      discountPerOrder: DISCOUNT_PER_ORDER,
      maxDiscount: MAX_DISCOUNT,
    },
    quotedAt: now,
  };
}

export function applyStatusMapping(request, status) {
  const s = String(status || "").trim();

  // manufacturerStage 는 생산 공정의 메인 단계를 나타내는 SSOT 라벨로 사용한다.

  // 명시적인 메인 단계 라벨은 그대로 manufacturerStage 로 사용
  const mainStages = [
    "의뢰",
    "CAM",
    "가공",
    "세척.패킹",
    "포장.발송",
    "추적관리",
    "취소",
  ];

  if (mainStages.includes(s)) {
    request.manufacturerStage = s;
    return;
  }

  // 세부 배송 문자열이 들어오더라도 manufacturerStage 는 shipping 으로 통일
  if (["배송대기", "배송중", "배송지연", "배송완료", "발송"].includes(s)) {
    request.manufacturerStage = "포장.발송";
  }
}

/**
 * 리퍼럴 그룹 내 모든 멤버 ID 조회
 * 그룹 리더 또는 멤버의 ID를 받으면, 그룹 리더 기준으로 모든 멤버를 반환
 * 레거시 계정(referralGroupLeaderId 없음)도 지원
 * @param {ObjectId|string} userId - 조회 대상 사용자 ID
 * @returns {Promise<ObjectId[]>} 그룹 내 모든 멤버 ID (본인 포함)
 */
export async function getReferralGroupMembers(userId) {
  if (!userId) return [];

  const userIdStr = String(userId);
  if (!Types.ObjectId.isValid(userIdStr)) return [];
  const userIdObj = new Types.ObjectId(userIdStr);

  // 1) 현재 사용자 조회
  const user = await User.findById(userIdObj)
    .select({ referralGroupLeaderId: 1, referredByUserId: 1, createdAt: 1 })
    .lean();

  if (!user) return [];

  const groupLeaderId = await getReferralGroupLeaderId(userIdObj, user);

  // 3) 그룹 리더 기준으로 모든 멤버 조회
  // 레거시 호환: referralGroupLeaderId가 있는 멤버 + referredByUserId로 직접 연결된 멤버
  const groupMembers = await User.find({
    $or: [
      { _id: groupLeaderId },
      { referralGroupLeaderId: { $eq: groupLeaderId } },
      {
        referredByUserId: groupLeaderId,
        referralGroupLeaderId: { $exists: false },
      }, // 레거시: 직접 추천
    ],
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return groupMembers.map((m) => m._id);
}

export async function getReferralGroupLeaderId(userIdObj, userLean) {
  if (!userIdObj) return null;

  const userId =
    typeof userIdObj === "string" ? new Types.ObjectId(userIdObj) : userIdObj;

  const user = userLean
    ? userLean
    : await User.findById(userId)
        .select({ referralGroupLeaderId: 1, referredByUserId: 1 })
        .lean();

  if (!user) return userId;

  // 레거시 user 기반 리더 필드 호환:
  // canonical 집계 단위는 business이지만, 기존 referralGroupLeaderId 체계와의 호환을 위해
  // requestor가 사업자에 속해 있으면 해당 business를 대표하던 기존 leader 값을 우선 사용한다.
  if (user?.businessId) {
    const orgIdStr = String(user.businessId);
    if (Types.ObjectId.isValid(orgIdStr)) {
      const org = await RequestorOrganization.findById(orgIdStr)
        .select({ owner: 1 })
        .lean();
      const ownerId = org?.owner ? String(org.owner) : "";
      if (ownerId && Types.ObjectId.isValid(ownerId)) {
        return new Types.ObjectId(ownerId);
      }
    }
  }

  let groupLeaderId = user.referralGroupLeaderId;

  if (!groupLeaderId && user.referredByUserId) {
    const referrer = await User.findById(user.referredByUserId)
      .select({ referralGroupLeaderId: 1 })
      .lean();

    groupLeaderId = referrer?.referralGroupLeaderId || user.referredByUserId;
  }

  groupLeaderId = groupLeaderId || userId;

  const groupLeaderIdStr = String(groupLeaderId);
  if (!Types.ObjectId.isValid(groupLeaderIdStr)) {
    return userId;
  }
  return new Types.ObjectId(groupLeaderIdStr);
}

/**
 * 사용자 삭제/비활성화 시 그룹 리더 변경 처리
 * 삭제되는 리더의 직접 추천인(referredByUserId가 이 리더인 사람) 중
 * 가장 오래된 멤버를 새로운 리더로 승격
 * @param {ObjectId|string} deletedUserId - 삭제되는 사용자 ID
 */
export async function handleReferralGroupLeaderChange(deletedUserId) {
  if (!deletedUserId) return;

  const deletedUserIdObj = new Types.ObjectId(String(deletedUserId));

  // 1) 삭제되는 사용자가 누군가의 리더인지 확인
  const groupMembers = await User.find({
    referralGroupLeaderId: deletedUserIdObj,
    active: true,
  })
    .select({ _id: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .lean();

  if (groupMembers.length === 0) {
    // 그룹 멤버가 없으면 처리할 것 없음
    return;
  }

  // 2) 가장 오래된 멤버를 새로운 리더로 지정
  const newLeaderId = groupMembers[0]._id;

  // 3) 모든 그룹 멤버의 리더를 새로운 리더로 변경
  await User.updateMany(
    { referralGroupLeaderId: deletedUserIdObj },
    { referralGroupLeaderId: newLeaderId },
  );

  console.log(
    `[Referral Group] Leader changed: ${deletedUserIdObj} -> ${newLeaderId}`,
  );
}
