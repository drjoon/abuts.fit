import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import Connection from "../../models/connection.model.js";
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
  d10: 1,
  d12: 1,
};

export function getRequestorOrgId(req) {
  const raw = req?.user?.organizationId;
  return raw ? String(raw) : "";
}

export function buildRequestorOrgFilter(req) {
  if (req?.user?.role !== "requestor") return {};
  const orgId = getRequestorOrgId(req);
  if (orgId && Types.ObjectId.isValid(orgId)) {
    return { requestorOrganizationId: new Types.ObjectId(orgId) };
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
      { requestorOrganizationId: orgObjectId },
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
  waiting: ["포장.발송", "추적관리"],
  bulkCandidateAll: [
    "의뢰",
    "CAM",
    "가공",
    "세척.패킹",
    "포장.발송",
    "추적관리",
  ],
  bulkCreateEligible: ["CAM", "가공", "세척.패킹", "포장.발송"],
};

const REQUEST_STAGE_ORDER = {
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
  const reqOrgId = requestDoc.requestorOrganizationId
    ? String(requestDoc.requestorOrganizationId)
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

  // 의뢰의 조직 ID 확인 (직접 저장된 것 또는 requestor.organizationId)
  const populatedReqUserOrgId = populatedReqUser?.organizationId
    ? String(populatedReqUser.organizationId)
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
  void maxDiameter;
  return addKoreanBusinessDays({ startYmd: todayYmd, days: 1 });
}

export async function getDeliveryEtaLeadDays() {
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return {
      ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
      ...(doc?.deliveryEtaLeadDays || {}),
    };
  } catch {
    return DEFAULT_DELIVERY_ETA_LEAD_DAYS;
  }
}

export async function normalizeCaseInfosImplantFields(caseInfos) {
  const ci = caseInfos && typeof caseInfos === "object" ? { ...caseInfos } : {};

  const manufacturer = (ci.implantManufacturer || "").trim();
  const system = (ci.implantSystem || "").trim();
  const type = (ci.implantType || "").trim();
  const legacyConnectionType = (ci.connectionType || "").trim();
  delete ci.connectionType;

  // 이미 신 스키마가 완성되어 있으면 그대로
  if (manufacturer && system && type) {
    return {
      ...ci,
      implantManufacturer: manufacturer,
      implantSystem: system,
      implantType: type,
    };
  }

  // 레거시(밀린 값) 케이스를 최대한 복원
  // - 과거: implantSystem=제조사, implantType=시스템, connectionType=유형
  // - 현재 문제 데이터: implantSystem=시스템(Regular), implantType=유형(Hex), connectionType=유형(Hex)
  const candidateManufacturer = manufacturer || "";
  const rawA = system; // implantSystem
  const rawB = type || legacyConnectionType; // implantType 우선

  // 1) 과거 스키마(implantSystem=제조사)로 들어온 경우
  //    제조사가 비어 있고 connectionType이 있는 경우가 많음
  if (!candidateManufacturer && system && legacyConnectionType && !type) {
    return {
      ...ci,
      implantManufacturer: system,
      implantSystem: (ci.implantType || "").trim(),
      implantType: legacyConnectionType,
    };
  }

  // 2) connections DB로 복원 시도 (system/type 조합으로 manufacturer 찾기)
  //    - (Regular, Hex) 같은 조합이 manufacturer별로 중복될 수 있으나,
  //      기존 데이터가 밀린 상태라면 manufacturer가 없으므로 첫 매칭을 사용한다.
  if (!candidateManufacturer && rawA && rawB) {
    const found = await Connection.findOne({
      isActive: true,
      system: rawA,
      type: rawB,
    })
      .select({ manufacturer: 1, system: 1, type: 1 })
      .lean();

    if (found) {
      return {
        ...ci,
        implantManufacturer: found.manufacturer,
        implantSystem: found.system,
        implantType: found.type,
      };
    }
  }

  // 3) 마지막 fallback: 있는 값들을 최대한 채움
  return {
    ...ci,
    implantManufacturer: candidateManufacturer,
    implantSystem: rawA,
    implantType: rawB,
  };
}

export async function normalizeRequestForResponse(requestDoc) {
  if (!requestDoc) return requestDoc;
  const obj =
    typeof requestDoc.toObject === "function"
      ? requestDoc.toObject()
      : requestDoc;
  const ci = obj.caseInfos || {};
  obj.caseInfos = await normalizeCaseInfosImplantFields(ci);
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
  if (requestDoc.lotNumber.part) return;

  // 로트 규칙(반제품/CAP, 크라운은 CR): PREFIX + YYMMDD + "-" + 26진 3자리 (AAA, AAB, ... ZZZ 이후 다시 AAA)
  const todayYmd = getTodayYmdInKst(); // YYYY-MM-DD
  const yyMMdd = todayYmd.replace(/-/g, "").slice(2); // YYMMDD

  const letters = await nextLotLetters();
  const prefix = getWorkTypePrefix(requestDoc, { defaultPrefix: "CAP" });
  requestDoc.lotNumber.part = `${prefix}${yyMMdd}-${letters}`;
}

export async function ensureFinishedLotNumberForPacking(requestDoc) {
  if (!requestDoc) return;

  requestDoc.lotNumber = requestDoc.lotNumber || {};
  if (requestDoc.lotNumber.final) return;

  const todayYmd = getTodayYmdInKst();
  const yyMMdd = todayYmd.replace(/-/g, "").slice(2);
  const partLot = String(requestDoc.lotNumber?.part || "");
  const prefix = getWorkTypePrefix(requestDoc, { defaultPrefix: "CA" });
  const reuseSequence = (() => {
    // lotNumber.part 예: CAP241120-ABC → "CAP" 이후 모든 문자열("241120-ABC")을 재사용
    if (!partLot.startsWith("CAP")) return null;
    return partLot.slice(3) || null;
  })();

  if (reuseSequence) {
    requestDoc.lotNumber.final = `${prefix}${reuseSequence}`;
    return;
  }

  const letters = await nextLotLetters();
  requestDoc.lotNumber.final = `${prefix}${yyMMdd}-${letters}`;
}

export async function computePriceForRequest({
  requestorId,
  requestorOrgId,
  clinicName,
  patientName,
  tooth,
}) {
  const now = new Date();

  const scopeFilter =
    requestorOrgId && Types.ObjectId.isValid(String(requestorOrgId))
      ? { requestorOrganizationId: new Types.ObjectId(String(requestorOrgId)) }
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
    "caseInfos.implantSystem": { $exists: true, $ne: "" },
    manufacturerStage: { $ne: "취소" },
    createdAt: { $gte: remakeCutoff },
  })
    .select({ _id: 1 })
    .lean();

  if (existing) {
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

  // 의뢰자 조직 단위 보상: 조직이 있으면 조직 owner를 그룹 리더로 사용
  if (user?.organizationId) {
    const orgIdStr = String(user.organizationId);
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
