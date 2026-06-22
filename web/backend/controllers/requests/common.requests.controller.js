import mongoose, { Types } from "mongoose";
import path from "path";
import Request from "../../models/request.model.js";
import Connection from "../../models/connection.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import User from "../../models/user.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  applyStatusMapping,
  canAccessRequestAsRequestor,
  normalizeRequestForResponse,
  normalizeWorksheetRequestForResponse,
  ensureLotNumberForMachining,
  ensureFinishedLotNumberForPacking,
  buildRequestorOrgScopeFilter,
  buildManufacturerOrgScopeFilter,
  computePriceForRequest,
  normalizeCaseInfosImplantFields,
  assertOrderableImplantPresetOrThrow,
  getTodayYmdInKst,
  bumpRollbackCount,
} from "./utils.js";
import { computeShippingPriority } from "./shippingPriority.utils.js";
import { getAllProductionQueues } from "../cnc/shared.js";
import s3Utils, {
  deleteFileFromS3,
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  triggerDashboardSummaryRefreshForAnchorId,
  triggerPricingSnapshotForBusinessAnchorId,
} from "../../services/requestSnapshotTriggers.service.js";
import { emitAppEventToRoles } from "../../socket.js";

const ESPRIT_BASE =
  process.env.ESPRIT_ADDIN_BASE_URL ||
  process.env.ESPRIT_BASE ||
  process.env.ESPRIT_URL ||
  "http://localhost:8001";

const __myRequestsCache = new Map();
const __myRequestsInFlight = new Map();

const getMyRequestsCacheValue = (key) => {
  const hit = __myRequestsCache.get(key);
  if (!hit) return null;
  if (typeof hit.expiresAt !== "number" || hit.expiresAt <= Date.now()) {
    __myRequestsCache.delete(key);
    return null;
  }
  return hit.value;
};

const setMyRequestsCacheValue = (key, value, ttlMs) => {
  __myRequestsCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

const withMyRequestsInFlight = async (key, factory) => {
  const existing = __myRequestsInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (__myRequestsInFlight.get(key) === promise) {
        __myRequestsInFlight.delete(key);
      }
    });

  __myRequestsInFlight.set(key, promise);
  return promise;
};

const BRIDGE_PROCESS_BASE =
  process.env.BRIDGE_NODE_URL ||
  process.env.BRIDGE_PROCESS_BASE ||
  process.env.CNC_BRIDGE_BASE ||
  process.env.BRIDGE_BASE ||
  "http://localhost:8002";

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

const DEFAULT_SELF_INSPECTION_INSTRUMENT_OPTIONS = [
  "현미경(AD-T-07)",
  "비전(AD-T-19)",
  "MICRO(AD-T-02)",
];

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

async function ensureRequestCancelRefund({ request, actorUserId }) {
  if (!request?._id) return;

  const businessAnchorId =
    request.businessAnchorId || request.requestor?.businessAnchorId;
  if (!businessAnchorId) return;

  const spendRows = await CreditLedger.find({
    businessAnchorId,
    type: "SPEND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({ amount: 1 })
    .lean();

  const refundRows = await CreditLedger.find({
    businessAnchorId,
    type: "REFUND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({ amount: 1 })
    .lean();

  const totalSpendAbs = Math.abs(
    (spendRows || []).reduce((acc, row) => {
      const amount = Number(row?.amount || 0);
      return acc + (Number.isFinite(amount) ? amount : 0);
    }, 0),
  );
  const totalRefund = (refundRows || []).reduce((acc, row) => {
    const amount = Number(row?.amount || 0);
    return acc + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const refundAmount = Math.max(0, totalSpendAbs - totalRefund);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) return;

  const uniqueKey = `request:${String(request._id)}:cancel_refund`;
  const result = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        businessAnchorId,
        userId: actorUserId || null,
        type: "REFUND",
        amount: refundAmount,
        refType: "REQUEST",
        refId: request._id,
        uniqueKey,
      },
    },
    { upsert: true },
  );

  if (result?.upsertedCount) {
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId,
      balanceDelta: refundAmount,
      reason: "request_cancel_refund",
      refId: request._id,
    });
  }
}

async function ensureDeliveryInfoShippedAtNow({ request, session }) {
  if (!request) return;

  const existingRef = request.deliveryInfoRef;
  const now = new Date();

  if (existingRef) {
    const di = await DeliveryInfo.findById(existingRef)
      .session(session || null)
      .catch(() => null);
    if (di && !di.shippedAt) {
      di.shippedAt = now;
      await di.save({ session });
    }
    return;
  }

  const created = await DeliveryInfo.create(
    [
      {
        request: request._id,
        shippedAt: now,
      },
    ],
    { session },
  ).catch(() => null);

  const doc = Array.isArray(created) ? created[0] : null;
  if (doc?._id) {
    request.deliveryInfoRef = doc._id;
  }
}

export async function getRequestSummaryByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId) {
      return res
        .status(400)
        .json({ success: false, message: "requestId is required" });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const request = await Request.findOne({ requestId }).select({
      _id: 1,
      requestId: 1,
      caseInfos: 1,
      createdAt: 1,
    });
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const tooth = request?.caseInfos?.tooth ?? null;
    const maxDiameter =
      typeof request?.caseInfos?.maxDiameter === "number"
        ? request.caseInfos.maxDiameter
        : null;

    return res.json({
      success: true,
      data: {
        _id: request._id,
        requestId: request.requestId,
        createdAt: request.createdAt ?? null,
        tooth,
        maxDiameter,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "요약 조회 실패" });
  }
}

export async function getSelfInspectionByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId)
      return res
        .status(400)
        .json({ success: false, message: "requestId required" });
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const request = await Request.findOne({ requestId }).select({
      selfInspection: 1,
    });
    if (!request)
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });

    return res.json({ success: true, data: request.selfInspection ?? null });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, message: "자주검사 조회 실패" });
  }
}

export async function getSelfInspectionInstrumentOptions(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const settings = await SystemSettings.findOne({ key: "global" })
      .select({ selfInspectionInstrumentOptions: 1 })
      .lean();

    const savedOptions = Array.isArray(
      settings?.selfInspectionInstrumentOptions,
    )
      ? settings.selfInspectionInstrumentOptions
      : [];

    const options = savedOptions.length
      ? savedOptions
      : DEFAULT_SELF_INSPECTION_INSTRUMENT_OPTIONS;

    return res.json({ success: true, data: options });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "측정장비 옵션 조회 실패",
    });
  }
}

export async function saveSelfInspectionInstrumentOptions(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const options = Array.isArray(req.body?.options)
      ? req.body.options.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    const uniqueOptions = [...new Set(options)];
    const finalOptions = uniqueOptions.length
      ? uniqueOptions
      : DEFAULT_SELF_INSPECTION_INSTRUMENT_OPTIONS;

    const updated = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          selfInspectionInstrumentOptions: finalOptions,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        select: { selfInspectionInstrumentOptions: 1 },
      },
    ).lean();

    return res.json({
      success: true,
      data: updated?.selfInspectionInstrumentOptions || finalOptions,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "측정장비 옵션 저장 실패",
    });
  }
}

export async function getConnectionSpecByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId)
      return res
        .status(400)
        .json({ success: false, message: "requestId required" });
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const request = await Request.findOne({ requestId }).select({
      caseInfos: 1,
    });
    if (!request)
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });

    const normalized = await normalizeCaseInfosImplantFields(
      request.caseInfos || {},
      false,
    );

    const manufacturer = String(normalized?.implantManufacturer || "").trim();
    const brand = String(normalized?.implantBrand || "").trim();
    const family = String(normalized?.implantFamily || "").trim();
    const implantType = String(normalized?.implantType || "").trim();

    if (!manufacturer || !brand || !family) {
      return res.json({ success: true, data: null });
    }

    const candidates = [];
    if (implantType === "Hex" || implantType === "Non-Hex") {
      candidates.push(implantType);
    }
    if (!candidates.includes("Hex")) candidates.push("Hex");
    if (!candidates.includes("Non-Hex")) candidates.push("Non-Hex");

    let connection = null;
    for (const type of candidates) {
      // eslint-disable-next-line no-await-in-loop
      connection = await Connection.findOne({
        manufacturer,
        brand,
        family,
        type,
        category: "hanhwa-connection",
      })
        .select({
          _id: 0,
          manufacturer: 1,
          brand: 1,
          family: 1,
          type: 1,
          diameter: 1,
          l2: 1,
          hexSize: 1,
          internalGauge: 1,
          protrusionLength: 1,
          fileName: 1,
          isActive: 1,
        })
        .lean();
      if (connection) break;
    }

    return res.json({ success: true, data: connection || null });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, message: "커넥션 스펙 조회 실패" });
  }
}

export async function saveSelfInspectionByRequestId(req, res) {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    if (!requestId)
      return res
        .status(400)
        .json({ success: false, message: "requestId required" });
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const { rows, overallJudgment, confirmedBy } = req.body;

    if (String(overallJudgment || "") !== "합격") {
      return res.status(400).json({
        success: false,
        message: "판정이 합격인 경우에만 확정할 수 있습니다.",
      });
    }

    const updated = await Request.findOneAndUpdate(
      { requestId },
      {
        $set: {
          "selfInspection.confirmed": true,
          "selfInspection.confirmedAt": new Date(),
          "selfInspection.confirmedBy": String(confirmedBy || ""),
          "selfInspection.overallJudgment": String(overallJudgment || ""),
          "selfInspection.rows": Array.isArray(rows) ? rows : [],
        },
      },
      { new: true, select: { selfInspection: 1 } },
    );

    if (!updated)
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });

    return res.json({ success: true, data: updated.selfInspection });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, message: "자주검사 저장 실패" });
  }
}

export async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터 (과도한 응답 방지를 위한 상한 적용)
    const page = parseInt(req.query.page) || 1;
    const MAX_LIMIT = 200;
    const limit = Math.min(parseInt(req.query.limit) || 10, MAX_LIMIT);
    const skip = (page - 1) * limit;

    // 뷰 및 포함 항목 옵션
    const view = String(req.query.view || "").trim(); // e.g. 'worksheet'
    const worksheetProfile = String(req.query.worksheetProfile || "").trim();
    const includeDelivery =
      String(req.query.includeDelivery || "").toLowerCase() === "1" ||
      String(req.query.includeDelivery || "").toLowerCase() === "true";

    // 필터링 파라미터
    const role = req.user?.role;
    let filter = {};
    if (req.query.manufacturerStage) {
      filter.manufacturerStage = req.query.manufacturerStage;
    }
    if (req.query.manufacturerStageIn) {
      const raw = Array.isArray(req.query.manufacturerStageIn)
        ? req.query.manufacturerStageIn
        : [req.query.manufacturerStageIn];
      const values = raw.map((v) => String(v || "").trim()).filter(Boolean);
      if (values.length) {
        filter.manufacturerStage = { $in: values };
      }
    }
    if (req.query.source) {
      filter.source = String(req.query.source || "").trim();
    }
    if (req.query.rndDone !== undefined) {
      const rndDoneRaw = String(req.query.rndDone || "")
        .trim()
        .toLowerCase();
      if (rndDoneRaw === "1" || rndDoneRaw === "true") {
        filter["rnd.doneAt"] = { $ne: null };
      } else if (rndDoneRaw === "0" || rndDoneRaw === "false") {
        filter["rnd.doneAt"] = null;
      }
    }
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 제조사: 같은 BusinessAnchor 조직 내 대표/직원이 의뢰 공유 + 취소 제외
    // buildManufacturerOrgScopeFilter가 조직 멤버 기반 필터를 생성
    if (role === "manufacturer") {
      const manufacturerOrgScope = await buildManufacturerOrgScopeFilter(req);
      filter = {
        $and: [
          filter,
          { manufacturerStage: { $ne: "취소" } },
          manufacturerOrgScope,
        ],
      };
    }

    // 레거시 MOCK_DEV_TOKEN 분기 제거됨

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회
    // worksheet 뷰에서는 목록 렌더링에 필요한 최소 필드만 선택해 페이로드를 줄인다.
    const worksheetSelect = [
      "requestId",
      "manufacturerStage",
      "createdAt",
      "lotNumber",
      "mailboxAddress",
      "shippingLabelPrinted",
      "shippingWorkflow",
      "businessAnchorId",
      "referenceIds",
      "source",
      "rnd.doneAt",
      "rnd.doneFromStage",
      "rnd.memo",
      "rnd.memoUpdatedAt",
      "rnd.memoUpdatedBy",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.file",
      "caseInfos.camFile",
      "caseInfos.ncFile",
      "caseInfos.stageFiles",
      "caseInfos.reviewByStage",
      "caseInfos.rollbackCounts",
      "caseInfos.finishLine",
      "caseInfos.implantManufacturer",
      "caseInfos.implantBrand",
      "caseInfos.implantFamily",
      "caseInfos.implantType",
      "caseInfos.maxDiameter",
      "caseInfos.connectionDiameter",
      "caseInfos.totalLength",
      "caseInfos.taperAngle",
      "caseInfos.camDiameter",
      "productionSchedule.diameter",
      "productionSchedule.diameterGroup",
      "productionSchedule.actualCamStart",
      "productionSchedule.actualCamComplete",
      "productionSchedule.actualMachiningComplete",
      "productionSchedule.scheduledShipPickup",
      "timeline.estimatedShipYmd",
      "requestor",
    ].join(" ");

    const worksheetTrackingSelect = [
      "requestId",
      "manufacturerStage",
      "createdAt",
      "lotNumber",
      "mailboxAddress",
      "shippingPackageId",
      "businessAnchorId",
      "referenceIds",
      "source",
      "rnd.doneAt",
      "rnd.doneFromStage",
      "rnd.memo",
      "rnd.memoUpdatedAt",
      "rnd.memoUpdatedBy",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "requestor",
      "deliveryInfoRef",
    ].join(" ");

    const worksheetShippingSelect = [
      "requestId",
      "manufacturerStage",
      "createdAt",
      "lotNumber",
      "mailboxAddress",
      "shippingPackageId",
      "shippingWorkflow",
      "shippingLabelPrinted",
      "businessAnchorId",
      "referenceIds",
      "source",
      "rnd.doneAt",
      "rnd.doneFromStage",
      "rnd.memo",
      "rnd.memoUpdatedAt",
      "rnd.memoUpdatedBy",
      "description",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.connectionDiameter",
      "caseInfos.implantManufacturer",
      "caseInfos.implantBrand",
      "caseInfos.implantFamily",
      "caseInfos.implantType",
      "timeline.estimatedShipYmd",
      "requestor",
      "deliveryInfoRef",
    ].join(" ");

    let query = Request.find(filter).sort(sort).skip(skip).limit(limit);

    // default to lightweight projection unless explicitly requesting full view
    if (view !== "full") {
      const selectedProjection =
        view === "worksheet" && worksheetProfile === "tracking"
          ? worksheetTrackingSelect
          : view === "worksheet" && worksheetProfile === "shipping"
            ? worksheetShippingSelect
            : worksheetSelect;
      const requestorPopulateSelect =
        view === "worksheet" && worksheetProfile === "shipping"
          ? "name business address addressText zipCode"
          : "name business";
      query = query
        .select(selectedProjection)
        .populate("requestor", requestorPopulateSelect)
        .populate("rnd.memoUpdatedBy", "name");
      if (view === "worksheet" && worksheetProfile === "shipping") {
        query = query.populate(
          "businessAnchorId",
          "name metadata shippingPolicy",
        );
      }
      if (includeDelivery) {
        // 배송 정보가 필요한 경우에만 최소 필드로 populate
        query = query.populate(
          "deliveryInfoRef",
          "shippedAt pickedUpAt deliveredAt carrier trackingNumber updatedAt tracking",
        );
      }
    } else {
      query = query
        .select("-messages")
        .populate("requestor", "name email business phoneNumber address")
        .populate("deliveryInfoRef")
        .populate("businessAnchorId", "name metadata");
    }

    const rawRequests = await query.lean();

    // 디버깅: 필터 조건과 결과 로그
    if (role === "manufacturer") {
      const stageFilter =
        filter.manufacturerStage ||
        filter.$and?.find((f) => f.manufacturerStage);
      console.log("[DEBUG] getAllRequests - role:", role);
      console.log(
        "[DEBUG] manufacturerStage filter:",
        JSON.stringify(stageFilter, null, 2),
      );
      console.log("[DEBUG] Full filter:", JSON.stringify(filter, null, 2));
      console.log(`[DEBUG] Found ${rawRequests.length} requests`);
      if (rawRequests.length > 0) {
        console.log(
          "[DEBUG] Sample requests:",
          rawRequests.slice(0, 5).map((r) => ({
            requestId: r.requestId,
            manufacturerStage: r.manufacturerStage,
            caManufacturer: r.caManufacturer,
          })),
        );
      }
    }

    const now = new Date();
    const isWorksheetView = view === "worksheet";

    // 성능 최적화: normalize와 shippingPriority 계산을 병렬 처리
    const requests = await Promise.all(
      rawRequests.map(async (r) => {
        const [shippingPriority, normalized] = await Promise.all([
          computeShippingPriority({ request: r, now }),
          isWorksheetView
            ? normalizeWorksheetRequestForResponse(r)
            : normalizeRequestForResponse(r),
        ]);
        return {
          ...normalized,
          shippingPriority,
        };
      }),
    );

    if (isWorksheetView) {
      const requestorAnchorIds = Array.from(
        new Set(
          requests
            .map((item) => {
              const raw = item?.businessAnchorId;
              if (!raw) return "";
              if (typeof raw === "object" && raw?._id) {
                return String(raw._id || "").trim();
              }
              return String(raw || "").trim();
            })
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      );

      const businesses = requestorAnchorIds.length
        ? await BusinessAnchor.find({
            _id: {
              $in: requestorAnchorIds.map((id) => new Types.ObjectId(id)),
            },
          })
            .select({ _id: 1, name: 1, metadata: 1, shippingPolicy: 1 })
            .lean()
        : [];

      const businessMap = new Map(
        businesses.map((row) => [String(row?._id || ""), row]),
      );

      for (const item of requests) {
        const raw = item?.businessAnchorId;
        const anchorId =
          raw && typeof raw === "object" && raw?._id
            ? String(raw._id || "").trim()
            : String(raw || "").trim();
        if (!anchorId) continue;

        const requestorOrgDoc = businessMap.get(anchorId);
        if (!requestorOrgDoc) continue;

        // SSOT: metadata 사용 (extracted 레거시 제거)
        const metadata =
          requestorOrgDoc.metadata &&
          typeof requestorOrgDoc.metadata === "object"
            ? requestorOrgDoc.metadata
            : undefined;
        const orgName =
          typeof requestorOrgDoc.name === "string"
            ? requestorOrgDoc.name.trim()
            : "";
        const companyName =
          typeof metadata?.companyName === "string"
            ? metadata.companyName.trim()
            : "";

        const shippingPolicyRaw =
          requestorOrgDoc.shippingPolicy &&
          typeof requestorOrgDoc.shippingPolicy === "object"
            ? requestorOrgDoc.shippingPolicy
            : undefined;
        const weeklyBatchDaysRaw = Array.isArray(
          shippingPolicyRaw?.weeklyBatchDays,
        )
          ? shippingPolicyRaw.weeklyBatchDays
              .map((v) => String(v || "").trim())
              .filter(Boolean)
          : [];
        const shippingPolicy = shippingPolicyRaw
          ? { ...shippingPolicyRaw, weeklyBatchDays: weeklyBatchDaysRaw }
          : undefined;

        item.business = {
          _id: anchorId,
          name: orgName || companyName || undefined,
          metadata,
          shippingPolicy,
        };
        item.requestorBusinessAnchor = item.business;
      }
    }

    // 전체 의뢰 수 (요청 시에만 계산)
    const includeTotal =
      String(req.query.includeTotal || "").toLowerCase() === "1" ||
      String(req.query.includeTotal || "").toLowerCase() === "true";

    const totalFilter = filter;

    const total = includeTotal
      ? await Request.countDocuments(totalFilter)
      : null;

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: total ? Math.ceil(total / limit) : null,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getMyRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 기본 필터: 로그인한 의뢰자 소속 기공소(조직) 기준
    const filter = await buildRequestorOrgScopeFilter(req);
    if (req.query.manufacturerStage) {
      filter.manufacturerStage = req.query.manufacturerStage;
    }
    if (req.query.manufacturerStageIn) {
      const raw = Array.isArray(req.query.manufacturerStageIn)
        ? req.query.manufacturerStageIn
        : [req.query.manufacturerStageIn];
      const values = raw.map((v) => String(v || "").trim()).filter(Boolean);
      if (values.length) {
        filter.manufacturerStage = { $in: values };
      }
    }
    if (req.query.implantType) filter.implantType = req.query.implantType;

    const cacheKey = `my-requests:${String(req.user?._id || "")}:${String(
      req.user?.businessAnchorId || "",
    )}:${JSON.stringify({
      page,
      limit,
      manufacturerStage: req.query.manufacturerStage || "",
      manufacturerStageIn: req.query.manufacturerStageIn || "",
      implantType: req.query.implantType || "",
      sortBy: req.query.sortBy || "",
      sortOrder: req.query.sortOrder || "",
    })}`;

    const cached = getMyRequestsCacheValue(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    const responseData = await withMyRequestsInFlight(cacheKey, async () => {
      const [rawRequests, total] = await Promise.all([
        Request.find(filter)
          .select({
            _id: 1,
            requestId: 1,
            createdAt: 1,
            title: 1,
            description: 1,
            manufacturerStage: 1,
            caseInfos: 1,
          })
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Request.countDocuments(filter),
      ]);

      const built = {
        requests: rawRequests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };

      setMyRequestsCacheValue(cacheKey, built, 15 * 1000);
      return built;
    });

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getRequestById(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId)
      .select("-messages")
      .populate(
        "requestor",
        "name email phoneNumber business businessAnchorId role",
      );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 조회 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 접근할 권한이 없습니다.",
      });
    }

    const normalized = await normalizeRequestForResponse(request);
    res.status(200).json({
      success: true,
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateRequest(req, res) {
  try {
    const requestId = req.params.id;
    const updateData = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId)
      .select("-messages")
      .populate("requestor", "businessAnchorId");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 수정 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 수정할 권한이 없습니다.",
      });
    }

    // 수정 불가능한 필드 제거
    delete updateData.requestId;
    delete updateData.requestor;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // CAM 승인 후 임플란트 정보 수정 차단 (관리자 제외)
    if (!isAdmin && camApproved && updateData.caseInfos) {
      return res.status(400).json({
        success: false,
        message: "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
      });
    }

    // 의뢰 상태별 수정 가능 필드 제한 (비관리자)
    let caseInfosAllowed = true;
    if (!isAdmin) {
      const stageStatus = String(request.manufacturerStage || "");

      // CAM 승인 이후(또는 가공/세척.패킹/포장.발송/추적 단계)는 caseInfos 수정 전면 차단
      const afterCam =
        camApproved ||
        ["가공", "세척.패킹", "포장.발송", "추적관리"].includes(stageStatus) ||
        (stageStatus === "CAM" && camApproved);

      if (afterCam) {
        const allowedTopLevelFields = [
          "messages",
          "patientName",
          "patientAge",
          "patientGender",
        ];
        Object.keys(updateData).forEach((key) => {
          if (key !== "caseInfos" && !allowedTopLevelFields.includes(key)) {
            delete updateData[key];
          }
        });
        if (updateData.caseInfos) {
          return res.status(400).json({
            success: false,
            message: "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
          });
        }
        caseInfosAllowed = false;
      } else if (stageStatus === "의뢰") {
        // 제한 없음
      } else if (stageStatus === "CAM") {
        // CAM 승인 전: 제한 없음 (caseInfos 허용)
      }
    }

    // caseInfos 정규화 (허용되는 단계에서만)
    if (
      caseInfosAllowed &&
      updateData &&
      updateData.caseInfos &&
      typeof updateData.caseInfos === "object"
    ) {
      try {
        updateData.caseInfos = await normalizeCaseInfosImplantFields(
          updateData.caseInfos,
        );

        // 주문 가능(활성화) 임플란트 조합만 수정 허용
        await assertOrderableImplantPresetOrThrow(updateData.caseInfos);
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message:
            validationError?.message ||
            "임플란트 정보 검증에 실패했습니다. 입력값을 확인해주세요.",
        });
      }
    } else if (!caseInfosAllowed && updateData?.caseInfos) {
      // 허용되지 않는 경우 caseInfos 삭제
      delete updateData.caseInfos;
    }

    // 의뢰 수정
    const updatedRequest = await Request.findById(requestId);
    if (updatedRequest) {
      Object.assign(updatedRequest, updateData);
      await updatedRequest.save();
    }

    const normalized = await normalizeRequestForResponse(updatedRequest);

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 수정되었습니다.",
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export const updateRndDoneStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const done = Boolean(req.body?.done);
  const allowedStagesForRestore = [
    "의뢰",
    "CAM",
    "가공",
    "세척.패킹",
    "포장.발송",
    "추적관리",
  ];

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 의뢰 ID입니다.",
    });
  }

  const request = await Request.findById(id);
  if (!request) {
    return res.status(404).json({
      success: false,
      message: "의뢰를 찾을 수 없습니다.",
    });
  }

  if (String(request.source || "").trim() !== "manufacturer_sample") {
    return res.status(400).json({
      success: false,
      message: "R&D 샘플 의뢰만 Done 처리할 수 있습니다.",
    });
  }

  if (req.user.role === "manufacturer") {
    const orgScope = await buildManufacturerOrgScopeFilter(req);
    const allowed = await Request.exists({
      _id: request._id,
      ...orgScope,
    });
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 변경할 권한이 없습니다.",
      });
    }
  }

  const currentStage = String(request.manufacturerStage || "").trim();
  request.rnd = {
    ...(request.rnd || {}),
    doneAt: done ? new Date() : null,
    doneBy: done ? req.user._id : null,
    doneFromStage: done
      ? currentStage || null
      : String(request.rnd?.doneFromStage || "").trim() || null,
  };

  let restoredStage = null;
  if (!done) {
    const restoreStage = String(request.rnd?.doneFromStage || "").trim();
    if (restoreStage && allowedStagesForRestore.includes(restoreStage)) {
      request.manufacturerStage = restoreStage;
      restoredStage = restoreStage;
    }
    request.rnd.doneFromStage = null;
  }

  await request.save();

  return res.status(200).json({
    success: true,
    data: {
      requestId: request.requestId,
      doneAt: request.rnd?.doneAt || null,
      restoredStage,
    },
  });
});

export const updateRndMemo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const memoRaw = String(req.body?.memo || "");
  const memo = memoRaw.slice(0, 500).trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 의뢰 ID입니다.",
    });
  }

  const request = await Request.findById(id);
  if (!request) {
    return res.status(404).json({
      success: false,
      message: "의뢰를 찾을 수 없습니다.",
    });
  }

  if (String(request.source || "").trim() !== "manufacturer_sample") {
    return res.status(400).json({
      success: false,
      message: "R&D 샘플 의뢰만 메모를 저장할 수 있습니다.",
    });
  }

  if (req.user.role === "manufacturer") {
    const orgScope = await buildManufacturerOrgScopeFilter(req);
    const allowed = await Request.exists({
      _id: request._id,
      ...orgScope,
    });
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 변경할 권한이 없습니다.",
      });
    }
  }

  request.rnd = {
    ...(request.rnd || {}),
    memo,
    memoUpdatedAt: memo ? new Date() : null,
    memoUpdatedBy: memo ? req.user?._id || null : null,
  };

  await request.save();

  const updaterName =
    String(req.user?.name || "").trim() ||
    String(
      (await User.findById(req.user?._id).select("name").lean())?.name || "",
    ).trim() ||
    "";

  return res.status(200).json({
    success: true,
    data: {
      requestId: request.requestId,
      memo: request.rnd?.memo || "",
      memoUpdatedAt: request.rnd?.memoUpdatedAt || null,
      memoUpdatedBy: request.rnd?.memoUpdatedBy || null,
      memoUpdatedByName: request.rnd?.memoUpdatedBy
        ? updaterName || null
        : null,
    },
  });
});

export async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { manufacturerStage } = req.body;

    // 상태 유효성 검사 (SSOT 라벨)
    const validStages = [
      "의뢰",
      "CAM",
      "가공",
      "세척.패킹",
      "포장.발송",
      "추적관리",
      "취소",
    ];
    if (!validStages.includes(manufacturerStage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 공정 단계입니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId).populate(
      "requestor",
      "businessAnchorId",
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 상태 변경 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰의 상태를 변경할 권한이 없습니다.",
      });
    }

    // 상태 변경 권한 확인
    if (manufacturerStage === "취소" && !isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "의뢰자 또는 관리자만 의뢰를 취소할 수 있습니다.",
      });
    }

    // 취소는 의뢰/CAM 단계에서만 가능
    if (manufacturerStage === "취소") {
      const currentStage = String(request.manufacturerStage || "").trim();
      const allowedCancelStages = ["의뢰", "CAM"];
      const isStageAllowed = allowedCancelStages.includes(currentStage);

      console.log("[updateManufacturerStage] Cancel validation", {
        requestId: request.requestId,
        currentStage,
        allowedCancelStages,
        isStageAllowed,
      });

      if (!isStageAllowed) {
        return res.status(400).json({
          success: false,
          message:
            "의뢰 또는 CAM 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
        });
      }
    }

    // 의뢰 상태 변경
    if (manufacturerStage === "취소") {
      await ensureRequestCancelRefund({
        request,
        actorUserId: req.user?._id || null,
      });
    }

    applyStatusMapping(request, manufacturerStage);

    // 신속배송(express) 모드 제거됨

    await request.save();

    console.log("[updateManufacturerStage] Stage updated", {
      requestId: request.requestId,
      newStage: manufacturerStage,
      businessAnchorId: String(request.businessAnchorId || ""),
    });

    // 취소 시 대시보드 스냅샷 무효화 (백그라운드)
    if (manufacturerStage === "취소") {
      const anchorId = String(request.businessAnchorId || "").trim();
      if (anchorId) {
        console.log("[updateManufacturerStage] Triggering dashboard refresh", {
          requestId: request.requestId,
          businessAnchorId: anchorId,
        });
        triggerDashboardSummaryRefreshForAnchorId(
          anchorId,
          `request-canceled:${request.requestId}`,
        ).catch((err) =>
          console.error(
            `[updateManufacturerStage] Dashboard refresh failed for ${request.requestId}:`,
            err,
          ),
        );
        triggerPricingSnapshotForBusinessAnchorId(
          anchorId,
          `request-canceled:${request.requestId}`,
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "의뢰 공정 단계가 성공적으로 변경되었습니다.",
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteRequest(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId).populate(
      "requestor",
      "businessAnchorId",
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const isAdmin = req.user.role === "admin";

    // 권한 검증: 관리자이거나 같은 기공소(조직) 의뢰자, 또는
    // R&D 샘플의 경우 같은 제조사 조직(임직원 포함)만 삭제 가능
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isSampleRequest = request.source === "manufacturer_sample";

    let isSampleManufacturerOrgMember = false;
    if (isSampleRequest && req.user.role === "manufacturer") {
      const orgScope = await buildManufacturerOrgScopeFilter(req);
      const allowed = await Request.exists({
        _id: request._id,
        ...orgScope,
      });
      isSampleManufacturerOrgMember = Boolean(allowed);
    }

    if (
      !isAdmin &&
      !isRequestor &&
      !(isSampleRequest && isSampleManufacturerOrgMember)
    ) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 삭제할 권한이 없습니다.",
      });
    }

    // 단계 검증: 관리자면 가공(machining) 단계 이전까지, 의뢰자면 의뢰/CAM 단계까지만 허용
    const stageStatus = String(request.manufacturerStage || "");

    // R&D 샘플은 제조사 조직 임직원/관리자가 완전 삭제
    if (isSampleRequest && (isAdmin || isSampleManufacturerOrgMember)) {
      await Request.findByIdAndDelete(request._id);

      console.log("[deleteRequest] R&D 샘플 완전 삭제", {
        requestId: request.requestId,
        deletedBy: req.user._id,
      });

      // 웹소켓: 카운트 업데이트 (감소)
      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
        stage: stageStatus,
        delta: -1,
        requestId: request.requestId,
        source: "manufacturer_sample",
        action: "deleted",
      });

      res.status(200).json({
        success: true,
        message: "R&D 샘플이 완전히 삭제되었습니다.",
      });
      return;
    }

    const deletableStages = isAdmin ? ["의뢰", "CAM", "가공"] : ["의뢰", "CAM"];

    if (!deletableStages.includes(stageStatus)) {
      return res.status(400).json({
        success: false,
        message: isAdmin
          ? "발송 단계 이후의 의뢰는 삭제할 수 없습니다."
          : "가공 단계 이후의 의뢰는 직접 삭제할 수 없습니다. 고객센터에 문의해주세요.",
      });
    }

    // 의뢰 취소 처리 (상태를 '취소'로 변경)
    await ensureRequestCancelRefund({
      request,
      actorUserId: req.user?._id || null,
    });

    applyStatusMapping(request, "취소");
    await request.save();

    console.log("[deleteRequest] Request deleted/canceled", {
      requestId: request.requestId,
      businessAnchorId: String(request.businessAnchorId || ""),
      stageStatus,
    });

    // 대시보드 스냅샷 무효화 (백그라운드)
    const anchorId = String(request.businessAnchorId || "").trim();
    if (anchorId) {
      console.log("[deleteRequest] Triggering dashboard refresh", {
        requestId: request.requestId,
        businessAnchorId: anchorId,
      });
      triggerDashboardSummaryRefreshForAnchorId(
        anchorId,
        `request-deleted:${request.requestId}`,
      ).catch((err) =>
        console.error(
          `[deleteRequest] Dashboard refresh failed for ${request.requestId}:`,
          err,
        ),
      );
      triggerPricingSnapshotForBusinessAnchorId(
        anchorId,
        `request-deleted:${request.requestId}`,
      );
    }

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 삭제되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

const CLONE_START_STAGE_VALUES = ["의뢰", "CAM", "가공"];

function parseCloneStartStage(
  value,
  { allowMachining = true, defaultStage = "의뢰" } = {},
) {
  const raw = String(value || "").trim();
  const allowed = allowMachining ? CLONE_START_STAGE_VALUES : ["의뢰", "CAM"];
  if (!raw) return defaultStage;
  if (!allowed.includes(raw)) {
    throw new ApiError(
      400,
      `시작 공정은 ${allowed.join(", ")} 중 하나여야 합니다.`,
    );
  }
  return raw;
}

function buildReviewByStageForStartStage(startStage, now = new Date()) {
  return {
    request: {
      status: startStage === "의뢰" ? "PENDING" : "APPROVED",
      updatedAt: now,
    },
    cam: {
      status: startStage === "가공" ? "APPROVED" : "PENDING",
      updatedAt: startStage === "가공" ? now : null,
    },
    machining: { status: "PENDING", updatedAt: null },
    packing: { status: "PENDING", updatedAt: null },
    shipping: { status: "PENDING", updatedAt: null },
    tracking: { status: "PENDING", updatedAt: null },
  };
}

function buildClonedCaseInfos(sourceCaseInfos, startStage, now = new Date()) {
  const base = {
    ...sourceCaseInfos,
    reviewByStage: buildReviewByStageForStartStage(startStage, now),
    rollbackCounts: {
      request: 0,
      cam: 0,
      machining: 0,
      packing: 0,
      shipping: 0,
      tracking: 0,
    },
    stageFiles: {
      machining: null,
      packing: null,
      shipping: null,
      tracking: null,
    },
  };

  // 시작 공정 이전 산출물은 유지하고, 이후 공정 산출물은 초기화한다.
  // - 의뢰 시작: CAM/NC 모두 제거
  // - CAM 시작: CAM은 유지, NC는 제거 (재생성 가능)
  // - 가공 시작: CAM/NC 모두 유지
  if (startStage === "가공") {
    return {
      ...base,
      camFile: sourceCaseInfos?.camFile || null,
      ncFile: sourceCaseInfos?.ncFile || null,
    };
  }

  if (startStage === "CAM") {
    return {
      ...base,
      camFile: sourceCaseInfos?.camFile || null,
      ncFile: null,
    };
  }

  return {
    ...base,
    camFile: null,
    ncFile: null,
  };
}

/**
 * 의뢰건을 내부 샘플로 복사
 * - 기존 의뢰건은 완료/진행 상태 그대로 유지 (원본 불변)
 * - 복사본은 제조사 내부 테스트/개발용으로 사용 (크레딧 미소비)
 * - 복사본은 R&D 탭에 즉시 보관되도록 생성 (`source=manufacturer_sample`, `rnd.doneAt!=null`)
 * - 원본 단계/배송정보/크레딧에는 영향 없이 분리 저장
 * - 허용 원본 단계: 세척.패킹, 추적관리, 배송완료 건
 * @route POST /api/requests/:id/clone-as-sample
 */
export async function cloneAsSample(req, res) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const request = await Request.findById(id).session(session).lean();

      if (!request) {
        throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
      }

      // 권한 검증: 제조사 또는 관리자만 가능
      if (!["manufacturer", "admin"].includes(req.user.role)) {
        throw new ApiError(403, "제조사 또는 관리자만 샘플 복사가 가능합니다.");
      }

      // 제조사 단계 확인
      // - 추적관리/배송완료는 기존과 동일하게 허용
      // - 세척.패킹 단계도 허용 (원본은 계속 진행, 복사본만 R&D로 생성)
      const stage = String(request.manufacturerStage || "").trim();
      const di = request.deliveryInfoRef || {};
      const isDelivered = !!di.deliveredAt;
      const isTrackingStage = stage === "추적관리";
      const isPackingStage = stage === "세척.패킹" || stage === "세척.포장";

      if (!isTrackingStage && !isDelivered && !isPackingStage) {
        throw new ApiError(
          400,
          "세척.패킹 진행중, 추적관리 완료 또는 배송 완료된 의뢰건만 샘플 복사가 가능합니다.",
        );
      }

      // 샘플 복사 시 로트번호는 새로 할당 (중복 인덱스 방지)
      // 원본 로트번호는 참조용으로 보존
      const originalLotValue = request.lotNumber?.value || null;
      const lotMaterial = request.lotNumber?.material || null;

      // 새 의뢰 생성 (기존 데이터 복사)
      const newRequest = new Request({
        // caseInfos 복사 (필요한 필드만)
        caseInfos: {
          ...request.caseInfos,
          // review 상태 초기화
          reviewByStage: {
            request: { status: "PENDING", updatedAt: new Date() },
            cam: { status: "PENDING", updatedAt: null },
            machining: { status: "PENDING", updatedAt: null },
            packing: { status: "PENDING", updatedAt: null },
            shipping: { status: "PENDING", updatedAt: null },
            tracking: { status: "PENDING", updatedAt: null },
          },
          rollbackCounts: {
            request: 0,
            cam: 0,
            machining: 0,
            packing: 0,
            shipping: 0,
            tracking: 0,
          },
          // 파일 정보는 원본에서 복사 (STL/fill 결과는 재사용)
          // 단, NC는 복사하지 않는다.
          // - 샘플은 의뢰 단계에서 시작하므로 REQUEST_STAGE_APPROVED 시 Esprit 트리거가 필요
          // - ncFile을 복사하면 ReviewApprovalQueue가 "이미 NC 존재"로 판단해 Esprit를 스킵함
          file: request.caseInfos?.file || null,
          camFile: request.caseInfos?.camFile || null,
          ncFile: null,
          finishLine: request.caseInfos?.finishLine || null,
        },
        // 의뢰자 정보는 원본과 동일하게 (통계/추적용)
        requestor: request.requestor,
        businessAnchorId: request.businessAnchorId,
        // 제조사는 현재 사용자 (복사 실행자)
        caManufacturer: req.user._id,
        // 원본의 현재 제조사 단계를 보존하되, R&D 노출은 rnd.doneAt으로 제어
        manufacturerStage: stage || "추적관리",
        // 출처 표시: 내부 샘플
        source: "manufacturer_sample",
        // R&D 탭 즉시 표시를 위한 done 상태
        rnd: {
          doneAt: new Date(),
          doneBy: req.user._id,
          doneFromStage: stage || null,
        },
        // 가격 정보 없음 (크레딧 미소비)
        price: {
          amount: 0,
          baseAmount: 0,
          discountAmount: 0,
          currency: "KRW",
          rule: "manufacturer_sample",
          paidAmount: 0,
          bonusAmount: 0,
        },
        // 배송 정보 초기화
        originalShipping: {
          mode: "normal",
          requestedAt: new Date(),
        },
        finalShipping: {
          mode: "normal",
          updatedAt: new Date(),
        },
        // 우편함 정보 초기화
        mailboxAddress: null,
        shippingLabelPrinted: {
          printed: false,
          printedAt: null,
          mailboxAddress: null,
          snapshotFingerprint: null,
        },
        shippingWorkflow: {
          code: "none",
          label: "미처리",
        },
        // 로트번호는 복사본에 저장하지 않음 (원본 불변 + 중복 인덱스/크레딧 영향 방지)
        // 원본 로트번호/재질은 상태 이력(note)으로만 남김
        // 생산 스케줄 새로 계산
        productionSchedule: {
          assignedMachine: null,
          queuePosition: null,
          machiningQty: 1,
          diameter: request.productionSchedule?.diameter || null,
          diameterGroup: request.productionSchedule?.diameterGroup || null,
        },
        // 타임라인 초기화
        timeline: {
          originalEstimatedShipYmd: null,
          nextEstimatedShipYmd: null,
          estimatedShipYmd: null,
          forceTodayShipment: false,
          actualCompletion: null,
        },
        // 배송 정보 없음
        shippingPackageId: null,
        deliveryInfoRef: null,
        // 결제 정보 없음
        paymentStatus: "결제전",
        paymentDetails: null,
        // 자가검사 정보 초기화
        selfInspection: {
          confirmed: false,
          confirmedAt: null,
          confirmedBy: null,
          overallJudgment: null,
          rows: [],
        },
        // 상태 이력 초기화
        statusHistory: [
          {
            status: "내부 샘플 복사 생성",
            note: `원본 의뢰: ${request.requestId}${originalLotValue ? `, 원본 로트번호: ${originalLotValue}` : ""}${lotMaterial ? `, 재질: ${lotMaterial}` : ""}`,
            updatedBy: req.user._id,
            updatedAt: new Date(),
          },
        ],
      });

      // 인덱스 우회를 위해 직접 저장 (pre-save 훅은 requestId 자동 생성)
      await newRequest.save({ session });

      // 트리거: 대시보드 갱신 (원본 의뢰자 대시보드)
      const anchorId = String(request.businessAnchorId || "").trim();
      if (anchorId) {
        triggerDashboardSummaryRefreshForAnchorId(
          anchorId,
          `sample-cloned:${newRequest.requestId}`,
        ).catch(() => {});
      }

      // 웹소켓: 제조사 워크시트 카운트 업데이트 (실시간)
      // R&D 샘플 복사본은 R&D 보관 대상으로 생성됨
      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
        stage: "rnd",
        delta: 1,
        requestId: newRequest.requestId,
        source: "manufacturer_sample",
        originalRequestId: request.requestId,
      });

      res.status(201).json({
        success: true,
        message: "내부 샘플이 성공적으로 생성되었습니다.",
        data: {
          requestId: newRequest.requestId,
          originalRequestId: request.requestId,
          originalLotNumber: originalLotValue,
          source: "manufacturer_sample",
        },
      });
    });
  } catch (error) {
    console.error("[cloneAsSample] Error:", error);
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "샘플 복사 중 오류가 발생했습니다.",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
}

/**
 * R&D 샘플 의뢰를 '의뢰' 탭 작업용으로 복사
 * - 원본 R&D 샘플은 유지
 * - 복사본은 source=manufacturer_sample, rnd.doneAt=null, manufacturerStage='의뢰'
 * @route POST /api/requests/:id/clone-from-sample-to-request
 */
export async function cloneFromSampleToRequest(req, res) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, "유효하지 않은 의뢰 ID입니다.");
      }

      const request = await Request.findById(id).session(session).lean();
      if (!request) {
        throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
      }

      if (String(request.source || "").trim() !== "manufacturer_sample") {
        throw new ApiError(400, "R&D 샘플 의뢰만 복사할 수 있습니다.");
      }

      if (!["manufacturer", "admin"].includes(req.user.role)) {
        throw new ApiError(403, "제조사 또는 관리자만 복사할 수 있습니다.");
      }

      if (req.user.role === "manufacturer") {
        const orgScope = await buildManufacturerOrgScopeFilter(req);
        const allowed = await Request.exists({
          _id: request._id,
          ...orgScope,
        }).session(session);
        if (!allowed) {
          throw new ApiError(403, "이 의뢰를 복사할 권한이 없습니다.");
        }
      }

      const sourceCaseInfos = request.caseInfos || {};
      const now = new Date();
      const startStage = parseCloneStartStage(req.body?.startStage, {
        allowMachining: true,
        defaultStage: "의뢰",
      });

      const clonedRequest = new Request({
        caseInfos: buildClonedCaseInfos(sourceCaseInfos, startStage, now),
        requestor: request.requestor,
        businessAnchorId: request.businessAnchorId,
        caManufacturer: req.user._id,
        manufacturerStage: startStage,
        source: "manufacturer_sample",
        rnd: {
          doneAt: null,
          doneBy: null,
          doneFromStage: null,
          memo: "",
          memoUpdatedAt: null,
          memoUpdatedBy: null,
        },
        price: {
          amount: 0,
          baseAmount: 0,
          discountAmount: 0,
          currency: "KRW",
          rule: "manufacturer_sample",
          paidAmount: 0,
          bonusAmount: 0,
        },
        originalShipping: {
          mode: "normal",
          requestedAt: now,
        },
        finalShipping: {
          mode: "normal",
          updatedAt: now,
        },
        mailboxAddress: null,
        shippingLabelPrinted: {
          printed: false,
          printedAt: null,
          mailboxAddress: null,
          snapshotFingerprint: null,
        },
        shippingWorkflow: {
          code: "none",
          label: "미처리",
        },
        productionSchedule: {
          assignedMachine: null,
          queuePosition: null,
          machiningQty: 1,
          diameter: request.productionSchedule?.diameter || null,
          diameterGroup: request.productionSchedule?.diameterGroup || null,
        },
        timeline: {
          originalEstimatedShipYmd: null,
          nextEstimatedShipYmd: null,
          estimatedShipYmd: null,
          forceTodayShipment: false,
          actualCompletion: null,
        },
        shippingPackageId: null,
        deliveryInfoRef: null,
        paymentStatus: "결제전",
        paymentDetails: null,
        selfInspection: {
          confirmed: false,
          confirmedAt: null,
          confirmedBy: null,
          overallJudgment: null,
          rows: [],
        },
        statusHistory: [
          {
            status: "R&D 샘플 의뢰 복사 생성",
            note: `원본 샘플 의뢰: ${request.requestId}, 시작 공정: ${startStage}`,
            updatedBy: req.user._id,
            updatedAt: now,
          },
        ],
      });

      await clonedRequest.save({ session });

      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
        stage:
          startStage === "의뢰"
            ? "request"
            : startStage === "CAM"
              ? "cam"
              : "machining",
        delta: 1,
        requestId: clonedRequest.requestId,
        source: "manufacturer_sample",
        originalRequestId: request.requestId,
      });

      res.status(201).json({
        success: true,
        message: `R&D 샘플이 ${startStage} 공정으로 복사되었습니다.`,
        data: {
          requestId: clonedRequest.requestId,
          originalRequestId: request.requestId,
          source: clonedRequest.source,
          manufacturerStage: clonedRequest.manufacturerStage,
          startStage,
        },
      });
    });
  } catch (error) {
    console.error("[cloneFromSampleToRequest] Error:", error);
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "R&D 복사 중 오류가 발생했습니다.",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
}

/**
 * 리콜 대상 의뢰건을 선택 공정(의뢰/CAM)으로 복사
 * - 원본 의뢰는 유지
 * - 복사본은 source=manufacturer_sample, rnd.doneAt=null 로 생성
 * - 프론트에서 카드 선택 또는 기간 선택으로 requestIds를 만들어 전달한다.
 * @route POST /api/requests/recall-clone
 */
export async function cloneRequestsForRecall(req, res) {
  try {
    if (!["manufacturer", "admin"].includes(String(req.user?.role || ""))) {
      throw new ApiError(403, "제조사 또는 관리자만 리콜 복사가 가능합니다.");
    }

    const startStage = parseCloneStartStage(req.body?.startStage, {
      allowMachining: false,
      defaultStage: "의뢰",
    });

    const rawIds = Array.isArray(req.body?.requestIds)
      ? req.body.requestIds
      : [];
    const uniqueIds = Array.from(
      new Set(
        rawIds
          .map((v) => String(v || "").trim())
          .filter((v) => mongoose.Types.ObjectId.isValid(v)),
      ),
    );

    if (!uniqueIds.length) {
      throw new ApiError(400, "리콜할 의뢰를 하나 이상 선택해주세요.");
    }

    const baseFilter = { _id: { $in: uniqueIds } };
    const scopeFilter =
      req.user.role === "manufacturer"
        ? await buildManufacturerOrgScopeFilter(req)
        : {};

    const sourceRequests = await Request.find({
      $and: [baseFilter, scopeFilter, { manufacturerStage: { $ne: "취소" } }],
    }).lean();

    const sourceMap = new Map(
      sourceRequests.map((item) => [String(item?._id || ""), item]),
    );

    const created = [];
    const failed = [];

    for (const id of uniqueIds) {
      const sourceRequest = sourceMap.get(String(id));
      if (!sourceRequest) {
        failed.push({
          requestId: id,
          message: "권한이 없거나 의뢰를 찾을 수 없습니다.",
        });
        continue;
      }

      try {
        const now = new Date();
        const sourceCaseInfos = sourceRequest.caseInfos || {};
        const clonedRequest = new Request({
          caseInfos: buildClonedCaseInfos(sourceCaseInfos, startStage, now),
          requestor: sourceRequest.requestor,
          businessAnchorId: sourceRequest.businessAnchorId,
          caManufacturer: req.user._id,
          manufacturerStage: startStage,
          source: "manufacturer_sample",
          rnd: {
            doneAt: null,
            doneBy: null,
            doneFromStage: null,
            memo: "",
            memoUpdatedAt: null,
            memoUpdatedBy: null,
          },
          price: {
            amount: 0,
            baseAmount: 0,
            discountAmount: 0,
            currency: "KRW",
            rule: "manufacturer_sample",
            paidAmount: 0,
            bonusAmount: 0,
          },
          originalShipping: {
            mode: "normal",
            requestedAt: now,
          },
          finalShipping: {
            mode: "normal",
            updatedAt: now,
          },
          mailboxAddress: null,
          shippingLabelPrinted: {
            printed: false,
            printedAt: null,
            mailboxAddress: null,
            snapshotFingerprint: null,
          },
          shippingWorkflow: {
            code: "none",
            label: "미처리",
          },
          productionSchedule: {
            assignedMachine: null,
            queuePosition: null,
            machiningQty: 1,
            diameter: sourceRequest.productionSchedule?.diameter || null,
            diameterGroup:
              sourceRequest.productionSchedule?.diameterGroup || null,
          },
          timeline: {
            originalEstimatedShipYmd: null,
            nextEstimatedShipYmd: null,
            estimatedShipYmd: null,
            forceTodayShipment: false,
            actualCompletion: null,
          },
          shippingPackageId: null,
          deliveryInfoRef: null,
          paymentStatus: "결제전",
          paymentDetails: null,
          selfInspection: {
            confirmed: false,
            confirmedAt: null,
            confirmedBy: null,
            overallJudgment: null,
            rows: [],
          },
          statusHistory: [
            {
              status: "리콜 복사 생성",
              note: `원본 의뢰: ${sourceRequest.requestId}, 시작 공정: ${startStage}`,
              updatedBy: req.user._id,
              updatedAt: now,
            },
          ],
        });

        await clonedRequest.save();

        emitAppEventToRoles(
          ["manufacturer", "admin"],
          "worksheet:count-update",
          {
            stage: startStage === "의뢰" ? "request" : "cam",
            delta: 1,
            requestId: clonedRequest.requestId,
            source: "manufacturer_sample",
            originalRequestId: sourceRequest.requestId,
          },
        );

        created.push({
          sourceRequestId: sourceRequest.requestId,
          clonedRequestId: clonedRequest.requestId,
          manufacturerStage: clonedRequest.manufacturerStage,
        });
      } catch (error) {
        failed.push({
          requestId: sourceRequest?.requestId || id,
          message: error?.message || "복사 실패",
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: `리콜 복사 완료 (${created.length}건 성공${failed.length ? `, ${failed.length}건 실패` : ""})`,
      data: {
        startStage,
        total: uniqueIds.length,
        successCount: created.length,
        failedCount: failed.length,
        created,
        failed,
      },
    });
  } catch (error) {
    console.error("[cloneRequestsForRecall] Error:", error);
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "리콜 복사 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}
