// change-log:
// - 2026-08-18: 준비 단계 진입 시 로트번호 발급. 워크시트 조회 시 누락분 보정. 샘플 복사는 준비 시작도 즉시 발급.
// - 2026-08-10: worksheet select에 caseInfos.memo/toothWorks/prosthesisType/files 추가(디자인 큐).
// - 2026-08-17: 취소/삭제 시 PTX 연동 어벗 디자인비(ADJUST) revoke.
// related files:
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/models/systemSettings.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxGrid.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/backend/rules.md
import mongoose, { Types } from "mongoose";
import path from "path";
import { createHash } from "crypto";
import Request from "../../models/request.model.js";
import Connection from "../../models/connection.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import User from "../../models/user.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  buildDesignClaimListVisibilityFilter,
  enrichDesignClaimForViewer,
} from "../../utils/designClaim.js";
import {
  applyStatusMapping,
  canAccessRequestAsRequestor,
  normalizeRequestForResponse,
  normalizeWorksheetRequestForResponse,
  normalizeRequestStage,
  ensureLotNumberForMachining,
  persistReadyLotNumbersIfMissing,
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
import { buildMonitoringStageStatsFromGroupedRows } from "../../services/requestStageStats.service.js";
import { buildCreatedAtFilterFromQuery } from "../../utils/dateRange.js";
import { ensureRequestCreditRollbackDeleteOnRollbackToCam } from "./common.review.helpers.js";

const ESPRIT_BASE =
  process.env.ESPRIT_ADDIN_BASE_URL ||
  process.env.ESPRIT_BASE ||
  process.env.ESPRIT_URL ||
  "http://localhost:8001";

const __myRequestsCache = new Map();
const __myRequestsInFlight = new Map();
const __trackingWorksheetCache = new Map();

const TRACKING_WORKSHEET_CACHE_TTL_MS = Number(
  process.env.TRACKING_WORKSHEET_CACHE_TTL_MS || 5000,
);
const TRACKING_WORKSHEET_CACHE_MAX_ENTRIES = Number(
  process.env.TRACKING_WORKSHEET_CACHE_MAX_ENTRIES || 300,
);

const resolveTrackingWorksheetCacheTtlMs = () => {
  const ttl = Number(TRACKING_WORKSHEET_CACHE_TTL_MS);
  if (!Number.isFinite(ttl) || ttl < 0) return 5000;
  return ttl;
};

const pruneTrackingWorksheetCache = () => {
  const now = Date.now();
  for (const [key, entry] of __trackingWorksheetCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      __trackingWorksheetCache.delete(key);
    }
  }

  const maxEntries = Number.isFinite(TRACKING_WORKSHEET_CACHE_MAX_ENTRIES)
    ? Math.max(50, Math.floor(TRACKING_WORKSHEET_CACHE_MAX_ENTRIES))
    : 300;

  if (__trackingWorksheetCache.size <= maxEntries) return;
  const overflow = __trackingWorksheetCache.size - maxEntries;
  const keys = Array.from(__trackingWorksheetCache.keys());
  for (let i = 0; i < overflow; i += 1) {
    __trackingWorksheetCache.delete(keys[i]);
  }
};

const buildTrackingWorksheetEtag = (payload) => {
  const raw = JSON.stringify(payload || {});
  const hash = createHash("sha1").update(raw).digest("hex");
  return `W/"tracking-worksheet-${hash}"`;
};

const resolveTrackingWorksheetCacheKey = ({ req, page, limit }) => {
  const role = String(req?.user?.role || "").trim();
  const userId = String(req?.user?._id || "").trim();
  const businessAnchorId = String(req?.user?.businessAnchorId || "").trim();

  const queryPairs = Object.entries(req?.query || {})
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [
          key,
          value
            .map((v) => String(v || ""))
            .sort()
            .join(","),
        ];
      }
      return [key, String(value || "")];
    })
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify({
    role,
    userId,
    businessAnchorId,
    page,
    limit,
    query: queryPairs,
  });
};

const applyTrackingWorksheetCacheHeaders = (res, etag, ttlMs) => {
  const maxAge = Math.max(0, Math.floor(ttlMs / 1000));
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${maxAge}, must-revalidate`);
  res.setHeader("Vary", "Authorization");
};

const isTrackingWorksheetNotModified = (req, etag) => {
  const ifNoneMatch = String(req?.headers?.["if-none-match"] || "").trim();
  return Boolean(ifNoneMatch && etag && ifNoneMatch === etag);
};

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

// related files (request category SSOT):
// - web/backend/models/request.model.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
const REQUEST_CATEGORY = {
  ORDER: "order",
  RND_SAMPLE: "rnd_sample",
  COPIED_SAMPLE: "copied_sample",
};

const resolveRequestCategory = (requestLike) => {
  const raw = String(requestLike?.requestCategory || "").trim();
  if (raw === REQUEST_CATEGORY.RND_SAMPLE) return REQUEST_CATEGORY.RND_SAMPLE;
  if (raw === REQUEST_CATEGORY.COPIED_SAMPLE)
    return REQUEST_CATEGORY.COPIED_SAMPLE;
  return REQUEST_CATEGORY.ORDER;
};

const isAnySampleRequest = (requestLike) => {
  const category = resolveRequestCategory(requestLike);
  return (
    category === REQUEST_CATEGORY.RND_SAMPLE ||
    category === REQUEST_CATEGORY.COPIED_SAMPLE
  );
};

const isRndSampleRequest = (requestLike) => {
  if (resolveRequestCategory(requestLike) === REQUEST_CATEGORY.RND_SAMPLE) {
    return true;
  }

  // 레거시 문서(requestCategory 누락) 호환:
  // source=manufacturer_sample && rnd.doneAt!=null 이면 R&D 샘플로 간주한다.
  const sourceRaw = String(requestLike?.source || "").trim();
  return sourceRaw === "manufacturer_sample" && requestLike?.rnd?.doneAt != null;
};

const buildNonSampleRequestGuard = () => ({
  $and: [
    // 레거시 문서(requestCategory 미기재)도 일반 의뢰건으로 포함하되,
    // source / price.rule 기준 샘플은 항상 제외한다.
    { source: { $ne: "manufacturer_sample" } },
    { "price.rule": { $ne: "manufacturer_sample" } },
    {
      requestCategory: {
        $nin: [REQUEST_CATEGORY.RND_SAMPLE, REQUEST_CATEGORY.COPIED_SAMPLE],
      },
    },
  ],
});

const DEFAULT_SELF_INSPECTION_INSTRUMENT_OPTIONS = [
  "현미경(AD-T-07)",
  "비전(AD-T-19)",
  "MICRO(AD-T-02)",
];

const DEFAULT_RND_UNMACHINABLE_REASON_OPTIONS = [];
const DEFAULT_MANUAL_PICKUP_REASON_OPTIONS = ["방문 전달"];

// related files (screw lot tracking):
// - web/backend/models/systemSettings.model.js
// - web/backend/models/request.model.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
const DEFAULT_PACKING_SCREW_TYPES = ["A", "B", "C", "D", "E"];

const normalizePackingScrewType = (value) =>
  String(value || "")
    .slice(0, 30)
    .trim()
    .toUpperCase();

const normalizePackingScrewLot = (value) =>
  String(value || "")
    .slice(0, 120)
    .trim();

const normalizePackingScrewLotItems = (itemsRaw, { withDefault = false } = {}) => {
  const source = Array.isArray(itemsRaw) ? itemsRaw : [];
  const items = [];

  for (const row of source) {
    const type = normalizePackingScrewType(row?.type);
    const lotNumber = normalizePackingScrewLot(row?.lotNumber);
    if (!type) continue;
    if (items.some((item) => item.type === type)) continue;
    items.push({ type, lotNumber });
    if (items.length >= 50) break;
  }

  if (items.length > 0 || !withDefault) return items;

  return DEFAULT_PACKING_SCREW_TYPES.map((type) => ({
    type,
    lotNumber: "",
  }));
};

const normalizePackingScrewLotSettings = (raw, { withDefault = false } = {}) => {
  if (Array.isArray(raw)) {
    return normalizePackingScrewLotItems(raw, { withDefault });
  }

  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.items)) {
      return normalizePackingScrewLotItems(raw.items, { withDefault });
    }

    // backward compatibility: legacy map object { A: "LOT-1", ... }
    return normalizePackingScrewLotItems(
      Object.entries(raw).map(([type, lotNumber]) => ({ type, lotNumber })),
      { withDefault },
    );
  }

  return normalizePackingScrewLotItems([], { withDefault });
};

const toPackingScrewLotMap = (itemsRaw) => {
  const items = normalizePackingScrewLotSettings(itemsRaw, { withDefault: false });
  return items.reduce((acc, item) => {
    acc[item.type] = item.lotNumber;
    return acc;
  }, {});
};

const mergePackingScrewLotItems = (currentRaw, patchRaw) => {
  const current = normalizePackingScrewLotSettings(currentRaw, { withDefault: true });
  const patch = normalizePackingScrewLotSettings(patchRaw, { withDefault: false });
  const map = new Map(current.map((item) => [item.type, item.lotNumber]));

  for (const row of patch) {
    map.set(row.type, row.lotNumber);
  }

  return Array.from(map.entries()).map(([type, lotNumber]) => ({
    type,
    lotNumber,
  }));
};

const normalizeReasonOptions = (optionsRaw, max = 100) => {
  if (!Array.isArray(optionsRaw)) return [];
  const unique = [];
  for (const raw of optionsRaw) {
    const normalized = String(raw || "")
      .slice(0, 500)
      .trim();
    if (!normalized) continue;
    if (unique.includes(normalized)) continue;
    unique.push(normalized);
    if (unique.length >= max) break;
  }
  return unique;
};

// related files (manufacturer hex rotation mode validation):
// - web/backend/controllers/bg/bg.controller.js
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
const normalizeHexRotationValue = (value) => {
  const v = String(value || "").trim();
  if (v === "STL모델대로" || v === "0") return "STL모델대로";
  if (v === "헥스30도회전" || v === "30") return "헥스30도회전";
  throw new Error(
    `유효하지 않은 헥스 회전 모드입니다. 'STL모델대로' | '헥스30도회전'만 허용됩니다. 입력값='${v}'`,
  );
};

// 헥스 회전 확장 포인트:
// - 신규 라벨은 "헥스X도회전" 패턴으로 이 함수에서만 정규화한다.
// - SSOT: 백엔드/Esprit 전달용 X는 totalDeg(=30+minorDeg) 기준으로 저장/전달한다.
//   예) 프론트가 minor 10도("헥스10도회전")를 선택하면 canonical은 "헥스40도회전".
// - 하위호환: 과거 저장값이 "헥스10도회전"(minor)일 수 있으므로 X<30이면 +30 보정한다.
// - 관련 파일: PreviewModal.tsx / RequestPage.tsx / bg.controller.js / NcFileGenerator.cs
const parseHexXRotationLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const matched = raw.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (!matched) return null;
  const parsedX = Number(matched[1]);
  if (!Number.isFinite(parsedX)) return null;
  const totalDeg = parsedX < 30 ? 30 + parsedX : parsedX;
  if (totalDeg === 30) return "헥스30도회전";
  return `헥스${String(totalDeg)}도회전`;
};

const parseManufacturerHexRotationMode = (value) => {
  const v = String(value || "").trim();
  if (v === "STL모델대로") return "STL모델대로";
  if (v === "헥스30도회전") return "헥스30도회전";
  // "헥스X도회전" 라벨 입력 허용
  // - 입력 minor(예: 헥스10도회전) -> canonical total(헥스40도회전)로 정규화
  const hexXLabel = parseHexXRotationLabel(v);
  if (hexXLabel) return hexXLabel;
  // legacy "헥스회전각" 호환: 0=STL모델대로, 30=헥스30도회전
  if (v === "0") return "STL모델대로";
  if (v === "30") return "헥스30도회전";
  return null;
};

const normalizeManufacturerHexRotationMode = (value) => {
  const parsed = parseManufacturerHexRotationMode(value);
  if (!parsed) {
    const raw = String(value || "").trim();
    throw new Error(
      `유효하지 않은 manufacturerHexRotation 값입니다. canonical 'STL모델대로' | '헥스30도회전' | '헥스X도회전(total)'만 허용됩니다. 입력값='${raw}'`,
    );
  }
  return parsed;
};

const resolveFinalHexRotationValue = ({
  manufacturerHexRotation,
}) => {
  const mode = normalizeManufacturerHexRotationMode(manufacturerHexRotation);
  // finalHexRotation은 canonical 모드 문자열만 사용한다.
  // 매핑:
  // - STL모델대로 => STL모델대로
  // - 헥스30도회전 => 헥스30도회전
  // - 헥스X도회전(total) => 헥스X도회전(total)
  if (
    mode === "STL모델대로" ||
    mode === "헥스30도회전" ||
    parseHexXRotationLabel(mode)
  ) {
    return mode;
  }
  throw new Error(
    `지원하지 않는 manufacturerHexRotation 모드입니다. mode='${String(mode)}'`,
  );
};

// Esprit 가공 SSOT: caseInfos.hexRotation.mode (폴백 없음)
export const resolveCaseInfosHexRotationMode = (requestDoc) => {
  const modeRaw = String(requestDoc?.caseInfos?.hexRotation?.mode || "").trim();
  if (!modeRaw) {
    const err = new Error(
      "헥스 회전(mode)이 설정되지 않았습니다. 준비 단계에서 'STL모델대로' 또는 '헥스30도회전'을 저장한 뒤 다시 시도해주세요.",
    );
    err.statusCode = 400;
    throw err;
  }
  const parsed = parseManufacturerHexRotationMode(modeRaw);
  if (!parsed) {
    const err = new Error(
      `헥스 회전(mode) 값이 유효하지 않습니다. mode='${modeRaw}'`,
    );
    err.statusCode = 400;
    throw err;
  }
  return parsed;
};

const normalizeLegacyManufacturerHexRotationOnRequest = (requestDoc) => {
  if (!requestDoc) return false;
  const raw = String(requestDoc?.rnd?.manufacturerHexRotation || "").trim();
  if (!raw) return false;
  const parsed = parseManufacturerHexRotationMode(raw);
  if (parsed) return false;

  // related files:
  // - web/backend/models/request.model.js
  // - web/backend/controllers/requests/creation.from-draft.controller.js
  // Rhino align 정책으로 구성정보 모드는 제거되었으므로,
  // 레거시 값(예: "구성정보")이 남아 있으면 저장 직전에 canonical 값으로 강제 정규화한다.
  requestDoc.set("rnd.manufacturerHexRotation", "STL모델대로");
  requestDoc.set(
    "caseInfos.finalHexRotation",
    resolveFinalHexRotationValue({ manufacturerHexRotation: "STL모델대로" }),
  );
  return true;
};

/**
 * 가공불가 상세 단계 코드를 계산한다.
 * - none: 관련 없음
 * - potential: 가능성 표시
 * - judged: 제조사/관리자 가공불가 판정
 * - confirmed: 의뢰자가 판정 내역 확인(읽음)
 */
const resolveUnmachinableDetailCode = (requestLike) => {
  if (requestLike?.rnd?.unmachinableConfirmedAt) return "confirmed";
  if (requestLike?.rnd?.unmachinableAt) return "judged";
  if (requestLike?.rnd?.unmachinablePotentialAt) return "potential";
  return "none";
};

const UNMACHINABLE_EVENT_ROLES = [
  "requestor",
  "manufacturer",
  "admin",
  "salesman",
  "devops",
];

const REQUEST_HEX_ROTATION_EVENT_ROLES = [
  "requestor",
  "manufacturer",
  "admin",
  "salesman",
  "devops",
];

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

async function ensureRequestCancelRollbackDelete({
  request,
  actorUserId,
  session,
  deferredCreditEvents,
}) {
  if (!request?._id) return;

  const currentStage = String(request?.manufacturerStage || "").trim();
  const currentStageLower = currentStage.toLowerCase();
  const isPostCamStageForCancel =
    currentStage === "가공" ||
    currentStage === "세척.패킹" ||
    currentStage === "포장.발송" ||
    currentStage === "추적관리" ||
    currentStage === "생산" ||
    currentStage === "세척.포장" ||
    currentStage === "발송" ||
    currentStageLower === "machining" ||
    currentStageLower === "production" ||
    currentStageLower === "packing" ||
    currentStageLower === "shipping" ||
    currentStageLower === "tracking";

  // 중요 정책:
  // - 준비 단계 취소만 차감 미발생 영역이다.
  // - 불완전가공 포함, 가공 이후 단계 취소는 기존 REQUEST_SPEND_COMMIT 차감을 유지한다.
  // 따라서 취소 경로에서의 소비 삭제는 CAM 복귀 롤백 타이밍과 혼동하지 않도록
  // post-CAM 단계에서는 수행하지 않는다.
  if (isPostCamStageForCancel) return;

  const businessAnchorId =
    request.businessAnchorId || request.requestor?.businessAnchorId;
  if (!businessAnchorId) return;

  // SSOT 정책: 취소 시 REFUND를 추가하지 않고, 기존 소비 커밋을 삭제형 롤백으로 정리한다.
  // 단, 이 삭제 정리는 준비 단계 취소 경로에서만 허용한다.
  // 크레딧 이벤트는 트랜잭션 커밋 이후 발행하도록 deferredCreditEvents에 적재한다.
  await ensureRequestCreditRollbackDeleteOnRollbackToCam({
    request,
    businessAnchorId,
    actorUserId,
    session: session || null,
    deferredCreditEvents,
  });

  try {
    const { releaseRequestCreditHoldsOnCancel } = await import(
      "../../services/requestCreditHold.service.js"
    );
    await releaseRequestCreditHoldsOnCancel({
      request,
      actorUserId,
      session: session || null,
      deferredCreditEvents,
    });
  } catch (holdErr) {
    console.warn(
      "[ensureRequestCancelRollbackDelete] hold release failed",
      String(request?._id || ""),
      holdErr?.message || holdErr,
    );
  }

  // PTX 연동 CA: 어벗 디자인비(ADJUST)도 함께 회수(관리자/의뢰자 삭제·취소).
  const relatedTransferId = String(
    request?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  if (relatedTransferId && Types.ObjectId.isValid(relatedTransferId)) {
    try {
      const { revokeAbutmentDesignLabFee } = await import(
        "../../services/practiceTransferBilling.service.js"
      );
      await revokeAbutmentDesignLabFee({
        requestDoc: request,
        transferId: relatedTransferId,
        labAnchorId: String(request.businessAnchorId || "").trim() || null,
        actorUserId: actorUserId || null,
      });
    } catch (revokeErr) {
      console.warn(
        "[ensureRequestCancelRollbackDelete] abutment design fee revoke failed",
        String(request?._id || ""),
        revokeErr?.message || revokeErr,
      );
    }
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
      shippingMode: 1,
      finalShipping: 1,
      originalShipping: 1,
      "timeline.estimatedShipYmd": 1,
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
    const estimatedShipYmd = String(
      request?.timeline?.estimatedShipYmd || "",
    ).trim();

    return res.json({
      success: true,
      data: {
        _id: request._id,
        requestId: request.requestId,
        createdAt: request.createdAt ?? null,
        tooth,
        maxDiameter,
        shippingMode: request.shippingMode || null,
        finalShipping: request.finalShipping
          ? { mode: request.finalShipping.mode || null }
          : null,
        originalShipping: request.originalShipping
          ? { mode: request.originalShipping.mode || null }
          : null,
        estimatedShipYmd: estimatedShipYmd || null,
        timeline: estimatedShipYmd
          ? { estimatedShipYmd }
          : undefined,
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

export async function getRndUnmachinableReasonOptions(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const settings = await SystemSettings.findOne({ key: "global" })
      .select({ rndUnmachinableReasonOptions: 1 })
      .lean();

    const options = normalizeReasonOptions(
      settings?.rndUnmachinableReasonOptions ||
        DEFAULT_RND_UNMACHINABLE_REASON_OPTIONS,
    );

    return res.json({ success: true, data: { options } });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "가공불가 사유 목록 조회 실패",
    });
  }
}

export async function saveRndUnmachinableReasonOptions(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const options = normalizeReasonOptions(req.body?.options || []);

    const updated = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          rndUnmachinableReasonOptions: options,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        select: { rndUnmachinableReasonOptions: 1 },
      },
    ).lean();

    return res.json({
      success: true,
      data: {
        options: normalizeReasonOptions(updated?.rndUnmachinableReasonOptions),
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "가공불가 사유 목록 저장 실패",
    });
  }
}

export async function getManualPickupReasonOptions(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const settings = await SystemSettings.findOne({ key: "global" })
      .select({ manualPickupReasonOptions: 1 })
      .lean();

    const options = normalizeReasonOptions(
      settings?.manualPickupReasonOptions || DEFAULT_MANUAL_PICKUP_REASON_OPTIONS,
    );

    return res.json({ success: true, data: { options } });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "수동 집하 사유 목록 조회 실패",
    });
  }
}

export async function saveManualPickupReasonOptions(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const normalized = normalizeReasonOptions(req.body?.options || []);
    const options = normalized.length
      ? normalized
      : DEFAULT_MANUAL_PICKUP_REASON_OPTIONS;

    const updated = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          manualPickupReasonOptions: options,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        select: { manualPickupReasonOptions: 1 },
      },
    ).lean();

    return res.json({
      success: true,
      data: {
        options: normalizeReasonOptions(
          updated?.manualPickupReasonOptions || options,
        ),
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "수동 집하 사유 목록 저장 실패",
    });
  }
}

export async function getPackingScrewLotSettings(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const settings = await SystemSettings.findOne({ key: "global" })
      .select({ packingScrewLotSettings: 1 })
      .lean();

    const items = normalizePackingScrewLotSettings(
      settings?.packingScrewLotSettings,
      { withDefault: true },
    );

    return res.json({
      success: true,
      data: {
        items,
        lots: toPackingScrewLotMap(items),
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "스크류 로트번호 설정 조회 실패",
    });
  }
}

export async function savePackingScrewLotSettings(req, res) {
  try {
    if (req.user.role !== "manufacturer" && req.user.role !== "admin")
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    const hasItemsPayload = Array.isArray(req.body?.items);
    const hasLegacyLotsPayload =
      req.body?.lots && typeof req.body?.lots === "object" && !Array.isArray(req.body?.lots);

    if (!hasItemsPayload && !hasLegacyLotsPayload) {
      return res.status(400).json({
        success: false,
        message: "items 배열(권장) 또는 lots 객체가 필요합니다.",
      });
    }

    const existing = await SystemSettings.findOne({ key: "global" })
      .select({ packingScrewLotSettings: 1 })
      .lean();

    let nextItems;
    if (hasItemsPayload) {
      nextItems = normalizePackingScrewLotSettings(req.body?.items, {
        withDefault: false,
      });
    } else {
      // backward compatibility: legacy { lots } payload는 patch merge로 처리
      nextItems = mergePackingScrewLotItems(existing?.packingScrewLotSettings, req.body?.lots);
    }

    const updated = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          packingScrewLotSettings: nextItems,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        select: { packingScrewLotSettings: 1 },
      },
    ).lean();

    const savedItems = normalizePackingScrewLotSettings(
      updated?.packingScrewLotSettings || nextItems,
      { withDefault: true },
    );

    return res.json({
      success: true,
      data: {
        items: savedItems,
        lots: toPackingScrewLotMap(savedItems),
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "스크류 로트번호 설정 저장 실패",
    });
  }
}

export async function assignPackingScrewLotToRequest(req, res) {
  try {
    const { id } = req.params;

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const screwType = normalizePackingScrewType(req.body?.screwType);
    if (!screwType) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 스크류 타입입니다.",
      });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const settings = await SystemSettings.findOne({ key: "global" })
      .select({ packingScrewLotSettings: 1 })
      .lean();
    const lots = toPackingScrewLotMap(settings?.packingScrewLotSettings);
    const lotNumber = normalizePackingScrewLot(lots[screwType]);

    if (!lotNumber) {
      return res.status(400).json({
        success: false,
        message: `스크류 ${screwType} 로트번호가 설정되지 않았습니다.`,
      });
    }

    const actorName = String(req.user?.name || "").trim();

    request.screwTracking = {
      screwType,
      lotNumber,
      assignedAt: new Date(),
      assignedBy: req.user?._id || null,
      assignedByName: actorName,
      source: "manual",
    };

    await request.save();

    return res.json({
      success: true,
      data: {
        requestId: request.requestId,
        screwTracking: request.screwTracking,
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "의뢰 스크류 로트번호 설정 실패",
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

    const isTrackingWorksheetRequest =
      view === "worksheet" && worksheetProfile === "tracking";
    let trackingWorksheetCacheKey = "";

    if (isTrackingWorksheetRequest) {
      pruneTrackingWorksheetCache();
      trackingWorksheetCacheKey = resolveTrackingWorksheetCacheKey({
        req,
        page,
        limit,
      });
      const cached = __trackingWorksheetCache.get(trackingWorksheetCacheKey);
      if (cached && Number(cached.expiresAt || 0) > Date.now()) {
        const etag = String(cached.etag || "");
        applyTrackingWorksheetCacheHeaders(
          res,
          etag,
          resolveTrackingWorksheetCacheTtlMs(),
        );
        if (isTrackingWorksheetNotModified(req, etag)) {
          return res.status(304).end();
        }
        return res.status(200).json({
          success: true,
          data: cached.payload,
          cached: true,
        });
      }
    }

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
    if (req.query.requestCategory) {
      filter.requestCategory = String(req.query.requestCategory || "").trim();
    }
    if (req.query.rndDone !== undefined) {
      const rndDoneRaw = String(req.query.rndDone || "")
        .trim()
        .toLowerCase();

      // 레거시 문서(requestCategory 누락) 호환:
      // source=manufacturer_sample && rnd.doneAt!=null 인 문서는 requestCategory가 비어 있어도
      // R&D done 샘플로 간주한다.
      const legacyAwareRndDoneGuard = {
        $or: [
          { requestCategory: REQUEST_CATEGORY.RND_SAMPLE },
          {
            $and: [
              { source: "manufacturer_sample" },
              { "rnd.doneAt": { $ne: null } },
            ],
          },
        ],
      };

      const appendFilterGuard = (baseFilter, guard) => {
        if (baseFilter && Array.isArray(baseFilter.$and)) {
          return {
            ...baseFilter,
            $and: [...baseFilter.$and, guard],
          };
        }
        if (!baseFilter || Object.keys(baseFilter).length === 0) {
          return guard;
        }
        return {
          $and: [baseFilter, guard],
        };
      };

      if (rndDoneRaw === "1" || rndDoneRaw === "true") {
        filter = appendFilterGuard(filter, legacyAwareRndDoneGuard);
      } else if (rndDoneRaw === "0" || rndDoneRaw === "false") {
        const legacyAwareRndNotDoneGuard = {
          $and: [
            { requestCategory: { $ne: REQUEST_CATEGORY.RND_SAMPLE } },
            {
              $or: [
                { source: { $ne: "manufacturer_sample" } },
                { "rnd.doneAt": null },
              ],
            },
          ],
        };
        filter = appendFilterGuard(filter, legacyAwareRndNotDoneGuard);
      }
    }
    if (req.query.rndUnmachinable !== undefined) {
      const rndUnmachinableRaw = String(req.query.rndUnmachinable || "")
        .trim()
        .toLowerCase();
      if (rndUnmachinableRaw === "1" || rndUnmachinableRaw === "true") {
        filter["rnd.unmachinableAt"] = { $nin: [null, ""] };
      } else if (
        rndUnmachinableRaw === "0" ||
        rndUnmachinableRaw === "false"
      ) {
        filter["rnd.unmachinableAt"] = { $in: [null, ""] };
      }
    }
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // caseInfos.productMode: 커스텀어벗 생산 vs 디자인+생산 분기
    // - productMode=design_custom_abutment → 디자인 페이지
    // - productModeNe=design_custom_abutment → 가공작업(준비)에서 디자인+생산 제외
    if (typeof req.query.productMode === "string") {
      const productMode = String(req.query.productMode || "").trim();
      if (productMode) {
        filter["caseInfos.productMode"] = productMode;
      }
    }
    if (typeof req.query.productModeNe === "string") {
      const productModeNe = String(req.query.productModeNe || "").trim();
      if (productModeNe) {
        // $ne는 필드 누락(레거시 생산)도 포함한다.
        filter["caseInfos.productMode"] = { $ne: productModeNe };
      }
    }

    // 디자인 파트너 큐: 활성 클레임 가시성 (본인 / 발표 1분 / 미클레임·만료)
    // 기공의뢰(PTX) 연동 건은 수락 기공소 전용 → 파트너 큐에서 제외
    const productModeFilter = String(req.query.productMode || "").trim();
    const isDesignPartnerQueue =
      Boolean(req.__designPartner) &&
      productModeFilter === "design_custom_abutment";
    if (isDesignPartnerQueue) {
      const claimVisibility = buildDesignClaimListVisibilityFilter(
        req.user?._id,
        new Date(),
      );
      const excludePtxLinked = {
        $or: [
          { "partnerBilling.relatedPracticeTransferId": null },
          { "partnerBilling.relatedPracticeTransferId": { $exists: false } },
        ],
      };
      const partnerQueueGuard = { $and: [claimVisibility, excludePtxLinked] };
      if (Array.isArray(filter.$and)) {
        filter.$and = [...filter.$and, partnerQueueGuard];
      } else if (Object.keys(filter).length === 0) {
        filter = partnerQueueGuard;
      } else {
        filter = { $and: [filter, partnerQueueGuard] };
      }
    }

    // 생성일 범위 필터 (관리자 모니터링/대시보드와 동일 파서 사용)
    const createdAtFilter = buildCreatedAtFilterFromQuery(req.query);
    if (createdAtFilter) {
      filter.createdAt = createdAtFilter;
    }

    // 관리자 모니터링: 내부 샘플/R&D·복사 샘플은 운영 의뢰로 집계·표시하지 않음
    // (price.rule=manufacturer_sample 이고 source/requestCategory 누락된 레거시 고스트 포함)
    if (view === "monitoring") {
      if (Array.isArray(filter.$and)) {
        filter.$and = [...filter.$and, buildNonSampleRequestGuard()];
      } else if (Object.keys(filter).length === 0) {
        filter = buildNonSampleRequestGuard();
      } else {
        filter = { $and: [filter, buildNonSampleRequestGuard()] };
      }
    }

    // 제조사: 같은 BusinessAnchor 조직 내 대표/직원이 의뢰 공유 + 취소 제외
    // buildManufacturerOrgScopeFilter가 조직 멤버 기반 필터를 생성
    if (role === "manufacturer") {
      const manufacturerOrgScope = await buildManufacturerOrgScopeFilter(req);

      // related files:
      // - web/backend/controllers/requests/creation.from-draft.controller.js
      // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
      // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
      // practice(치과->기공소) 전송건은 제조사 워크시트 루트에서 제외한다.
      const excludePracticeRouteGuard = {
        "caseInfos.newSystemRequest.tag": {
          $nin: ["practice_dropzone", "practice_file_transfer"],
        },
      };

      filter = {
        $and: [
          filter,
          { manufacturerStage: { $ne: "취소" } },
          manufacturerOrgScope,
          excludePracticeRouteGuard,
        ],
      };
    }

    // 추적관리 워크시트도 샘플 의뢰를 일반 의뢰와 동일하게 노출한다.
    // (샘플 완료 보관 여부는 rndDone 필터로 제어)

    // 레거시 MOCK_DEV_TOKEN 분기 제거됨

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
      // 페이지 경계 중복/누락 방지를 위해 항상 안정적인 tie-breaker를 추가
      if (sortField !== "_id") {
        sort._id = sortOrder;
      }
    } else {
      // 기본 정렬: 최신순 + _id tie-breaker
      sort.createdAt = -1;
      sort._id = -1;
    }

    // 의뢰 조회
    // worksheet 뷰에서는 목록 렌더링에 필요한 최소 필드만 선택해 페이로드를 줄인다.
    const worksheetSelect = [
      "requestId",
      "manufacturerStage",
      "createdAt",
      "lotNumber",
      "screwTracking",
      "mailboxAddress",
      "shippingLabelPrinted",
      "shippingWorkflow",
      "shippingMode",
      "originalShipping",
      "finalShipping",
      "businessAnchorId",
      "referenceIds",
      "source",
      "requestCategory",
      "rnd.doneAt",
      "rnd.doneFromStage",
      "rnd.unmachinablePotentialAt",
      "rnd.unmachinableAt",
      "rnd.unmachinableConfirmedAt",
      "rnd.unmachinableFromStage",
      "rnd.unmachinableReason",
      "rnd.requestorContinueAt",
      "rnd.requestorContinueBy",
      "rnd.requestorContinueMessage",
      "rnd.memo",
      "rnd.memoUpdatedAt",
      "rnd.memoUpdatedBy",
      "rnd.manufacturerHexRotation",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.productMode",
      "caseInfos.designSoftware",
      "caseInfos.memo",
      "caseInfos.toothWorks",
      "caseInfos.prosthesisType",
      "caseInfos.files",
      "designClaim",
      "caseInfos.manufacturerHexRotation",
      "caseInfos.anodizingEnabled",
      "caseInfos.retentionGroove",
      "caseInfos.requestorHexRotation",
      "caseInfos.finalHexRotation",
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
      "shippingReceiver",
      "partnerBilling.relatedPracticeTransferId",
      "partnerBilling.practiceBusinessAnchorId",
    ].join(" ");

    const worksheetTrackingSelect = [
      "requestId",
      "manufacturerStage",
      "createdAt",
      "lotNumber",
      "screwTracking",
      "mailboxAddress",
      "shippingPackageId",
      "shippingMode",
      "originalShipping",
      "finalShipping",
      "businessAnchorId",
      "referenceIds",
      "source",
      "requestCategory",
      "rnd.doneAt",
      "rnd.doneFromStage",
      "rnd.unmachinablePotentialAt",
      "rnd.unmachinableAt",
      "rnd.unmachinableConfirmedAt",
      "rnd.unmachinableFromStage",
      "rnd.unmachinableReason",
      "rnd.requestorContinueAt",
      "rnd.requestorContinueBy",
      "rnd.requestorContinueMessage",
      "rnd.memo",
      "rnd.memoUpdatedAt",
      "rnd.memoUpdatedBy",
      "rnd.manufacturerHexRotation",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.designSoftware",
      "caseInfos.manufacturerHexRotation",
      "caseInfos.requestorHexRotation",
      "caseInfos.finalHexRotation",
      "caseInfos.connectionDiameter",
      "caseInfos.maxDiameter",
      "caseInfos.totalLength",
      "caseInfos.implantManufacturer",
      "caseInfos.implantBrand",
      "caseInfos.implantFamily",
      "caseInfos.implantType",
      "spec.implantCompany",
      "spec.implantBrand",
      "spec.implantProduct",
      "spec.implantFamily",
      "spec.implantType",
      "spec.connectionDiameter",
      "spec.maxDiameter",
      "implantManufacturer",
      "implantBrand",
      "implantFamily",
      "implantType",
      "connectionDiameter",
      "maxDiameter",
      "totalLength",
      "requestor",
      "deliveryInfoRef",
    ].join(" ");

    const worksheetShippingSelect = [
      "requestId",
      "manufacturerStage",
      "createdAt",
      "lotNumber",
      "screwTracking",
      "mailboxAddress",
      "shippingPackageId",
      "shippingWorkflow",
      "shippingLabelPrinted",
      "shippingMode",
      "originalShipping",
      "finalShipping",
      "businessAnchorId",
      "referenceIds",
      "source",
      "requestCategory",
      "rnd.doneAt",
      "rnd.doneFromStage",
      "rnd.unmachinablePotentialAt",
      "rnd.unmachinableAt",
      "rnd.unmachinableConfirmedAt",
      "rnd.unmachinableFromStage",
      "rnd.unmachinableReason",
      "rnd.requestorContinueAt",
      "rnd.requestorContinueBy",
      "rnd.requestorContinueMessage",
      "rnd.memo",
      "rnd.memoUpdatedAt",
      "rnd.memoUpdatedBy",
      "rnd.manufacturerHexRotation",
      "description",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "caseInfos.designSoftware",
      "caseInfos.manufacturerHexRotation",
      "caseInfos.anodizingEnabled",
      "caseInfos.retentionGroove",
      "caseInfos.connectionDiameter",
      "caseInfos.requestorHexRotation",
      "caseInfos.finalHexRotation",
      "caseInfos.implantManufacturer",
      "caseInfos.implantBrand",
      "caseInfos.implantFamily",
      "caseInfos.implantType",
      "timeline.estimatedShipYmd",
      "requestor",
      "deliveryInfoRef",
      "shippingReceiver",
      "partnerBilling.relatedPracticeTransferId",
      "partnerBilling.practiceBusinessAnchorId",
    ].join(" ");

    // 관리자 의뢰 모니터링 전용 초경량 projection (카드 UI 사용 필드만)
    const monitoringSelect = [
      "requestId",
      "manufacturerStage",
      "priority",
      "createdAt",
      "progress",
      "caManufacturer",
      "source",
      "requestCategory",
      "shippingMode",
      "finalShipping.mode",
      "originalShipping.mode",
      "price.amount",
      "price.paidAmount",
      "price.rule",
      "caseInfos.clinicName",
      "caseInfos.patientName",
      "caseInfos.tooth",
      "requestor",
    ].join(" ");

    let query = Request.find(filter).sort(sort).skip(skip).limit(limit);

    // default to lightweight projection unless explicitly requesting full view
    if (view !== "full") {
      const isMonitoringView = view === "monitoring";
      const selectedProjection = isMonitoringView
        ? monitoringSelect
        : view === "worksheet" && worksheetProfile === "tracking"
          ? worksheetTrackingSelect
          : view === "worksheet" && worksheetProfile === "shipping"
            ? worksheetShippingSelect
            : worksheetSelect;
      // tracking/shipping 화면에서 그룹핑 키(ownerKey)를 businessAnchorId 기준으로 안정화하려면
      // requestor.businessAnchorId도 항상 내려가야 한다.
      // (이 값이 누락되면 프론트가 business 문자열 fallback을 쓰게 되어 동명이인/표기 흔들림으로
      //  서로 다른 기공소가 한 그룹으로 합쳐질 수 있다.)
      const requestorPopulateSelect =
        view === "worksheet" && worksheetProfile === "shipping"
          ? "name business businessAnchorId address addressText zipCode"
          : view === "worksheet" && worksheetProfile === "tracking"
            ? "name business businessAnchorId"
            : isMonitoringView
              ? "name business"
              : "name business businessAnchorId";

      query = query
        .select(selectedProjection)
        .populate("requestor", requestorPopulateSelect);

      if (!isMonitoringView && worksheetProfile !== "tracking") {
        query = query.populate("rnd.memoUpdatedBy", "name");
      }

      if (view === "worksheet") {
        const businessAnchorPopulateSelect =
          worksheetProfile === "shipping"
            ? "name metadata shippingPolicy requestSettings"
            : "name metadata requestSettings";
        query = query
          .populate("businessAnchorId", businessAnchorPopulateSelect)
          // PTX 직납: 준비~전 단계 카드 호버용 live 치과 연락처
          .populate(
            "partnerBilling.practiceBusinessAnchorId",
            "name metadata",
          );
      }
      if (includeDelivery) {
        // 배송 정보가 필요한 경우에만 최소 필드로 populate
        query = query.populate(
          "deliveryInfoRef",
          "shippedAt pickedUpAt deliveredAt carrier manualDeliveryMethods trackingNumber updatedAt tracking",
        );
      }
    } else {
      query = query
        .select("-messages")
        .populate("requestor", "name email business phoneNumber address")
        .populate("deliveryInfoRef")
        .populate("businessAnchorId", "name metadata requestSettings");
    }

    const now = new Date();
    const isWorksheetView = view === "worksheet";
    const isMonitoringView = view === "monitoring";

    // 전체 의뢰 수 / 모니터링 stage 집계 (요청 시에만)
    const includeTotal =
      String(req.query.includeTotal || "").toLowerCase() === "1" ||
      String(req.query.includeTotal || "").toLowerCase() === "true";

    const totalFilter = filter;

    // find + count/stats 를 병렬로 실행해 순차 round-trip을 제거
    const [rawRequests, totalFromCount, monitoringGroupedRows] =
      await Promise.all([
        query.lean(),
        includeTotal && !isMonitoringView
          ? Request.countDocuments(totalFilter)
          : Promise.resolve(null),
        isMonitoringView && (includeTotal || page === 1)
          ? Request.aggregate([
              { $match: totalFilter },
              {
                $group: {
                  _id: "$manufacturerStage",
                  count: { $sum: 1 },
                },
              },
            ])
          : Promise.resolve(null),
      ]);

    if (isWorksheetView) {
      await persistReadyLotNumbersIfMissing(rawRequests);
    }

    // 모니터링 뷰는 초경량 응답: normalize/우선순위 계산 생략
    const requests = isMonitoringView
      ? rawRequests
      : await Promise.all(
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
      // populate된 businessAnchorId를 우선 재사용하고, 미populate ID만 추가 조회
      const businessMap = new Map();
      const missingAnchorIds = new Set();

      for (const item of requests) {
        const raw = item?.businessAnchorId;
        if (raw && typeof raw === "object" && raw._id) {
          businessMap.set(String(raw._id), raw);
          continue;
        }
        const requestAnchorId = String(raw || "").trim();
        if (Types.ObjectId.isValid(requestAnchorId)) {
          missingAnchorIds.add(requestAnchorId);
          continue;
        }

        const rawRequestorAnchor =
          item?.requestor && typeof item.requestor === "object"
            ? item.requestor.businessAnchorId
            : null;
        if (rawRequestorAnchor && typeof rawRequestorAnchor === "object" && rawRequestorAnchor._id) {
          businessMap.set(String(rawRequestorAnchor._id), rawRequestorAnchor);
          continue;
        }
        const requestorAnchorId = String(rawRequestorAnchor || "").trim();
        if (Types.ObjectId.isValid(requestorAnchorId)) {
          missingAnchorIds.add(requestorAnchorId);
        }
      }

      if (missingAnchorIds.size > 0) {
        const businesses = await BusinessAnchor.find({
          _id: {
            $in: Array.from(missingAnchorIds).map(
              (id) => new Types.ObjectId(id),
            ),
          },
        })
          .select({
            _id: 1,
            name: 1,
            metadata: 1,
            shippingPolicy: 1,
            "requestSettings.designSoftware": 1,
            "requestSettings.anodizingEnabled": 1,
          })
          .lean();
        for (const row of businesses) {
          businessMap.set(String(row?._id || ""), row);
        }
      }

      for (const item of requests) {
        const raw = item?.businessAnchorId;
        const anchorIdFromRequest =
          raw && typeof raw === "object" && raw?._id
            ? String(raw._id || "").trim()
            : String(raw || "").trim();

        const rawRequestorAnchor =
          item?.requestor && typeof item.requestor === "object"
            ? item.requestor.businessAnchorId
            : null;
        const anchorIdFromRequestor =
          rawRequestorAnchor &&
          typeof rawRequestorAnchor === "object" &&
          rawRequestorAnchor?._id
            ? String(rawRequestorAnchor._id || "").trim()
            : String(rawRequestorAnchor || "").trim();

        const anchorId = Types.ObjectId.isValid(anchorIdFromRequest)
          ? anchorIdFromRequest
          : anchorIdFromRequestor;
        if (!Types.ObjectId.isValid(anchorId)) continue;

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
        const requestSettingsRaw =
          requestorOrgDoc.requestSettings &&
          typeof requestorOrgDoc.requestSettings === "object"
            ? requestorOrgDoc.requestSettings
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
          requestSettings: {
            designSoftware: String(
              requestSettingsRaw?.designSoftware || "",
            ).trim() || null,
            anodizingEnabled:
              typeof requestSettingsRaw?.anodizingEnabled === "boolean"
                ? requestSettingsRaw.anodizingEnabled
                : null,
          },
        };
        item.requestorBusinessAnchor = item.business;
      }
    }

    if (isDesignPartnerQueue && Array.isArray(requests)) {
      const nowMs = Date.now();
      const viewerId = req.user?._id;
      for (const item of requests) {
        if (!item || typeof item !== "object") continue;
        const meta = enrichDesignClaimForViewer(
          item.designClaim,
          viewerId,
          nowMs,
        );
        item.designClaimMeta = meta;
        item.designClaimPeerBusy = meta.peerBusy;
        item.designClaimClaimable = meta.claimable;
        item.designClaimMine = meta.mine;
        item.designClaimRemainingMs = meta.remainingMs;
        item.designClaimWarn = meta.warn;
      }
    }

    let total = totalFromCount;
    let monitoringStats = null;
    if (isMonitoringView && Array.isArray(monitoringGroupedRows)) {
      const derivedTotal = monitoringGroupedRows.reduce(
        (acc, row) => acc + Number(row?.count || 0),
        0,
      );
      if (includeTotal || total == null) {
        total = derivedTotal;
      }
      monitoringStats = buildMonitoringStageStatsFromGroupedRows(
        monitoringGroupedRows,
        total,
      );
    }

    const responseData = {
      requests,
      pagination: {
        total,
        page,
        limit,
        pages: total ? Math.ceil(total / limit) : null,
      },
      ...(isMonitoringView && monitoringStats ? { stats: monitoringStats } : {}),
    };

    if (isTrackingWorksheetRequest && trackingWorksheetCacheKey) {
      const etag = buildTrackingWorksheetEtag(responseData);
      const ttlMs = resolveTrackingWorksheetCacheTtlMs();
      __trackingWorksheetCache.set(trackingWorksheetCacheKey, {
        payload: responseData,
        etag,
        expiresAt: Date.now() + ttlMs,
      });
      applyTrackingWorksheetCacheHeaders(res, etag, ttlMs);
      if (isTrackingWorksheetNotModified(req, etag)) {
        return res.status(304).end();
      }
    }

    res.status(200).json({
      success: true,
      data: responseData,
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
    // 제조사 내부 샘플/자동복사본은 의뢰자 화면에 노출하지 않는다.
    // (헥스 이중 가공 복사본 포함)
    filter.$and = [
      ...(Array.isArray(filter.$and) ? filter.$and : []),
      buildNonSampleRequestGuard(),
    ];

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

    if (typeof req.query.productMode === "string") {
      const productMode = String(req.query.productMode || "").trim();
      if (productMode) {
        filter["caseInfos.productMode"] = productMode;
      }
    }
    if (typeof req.query.productModeNe === "string") {
      const productModeNe = String(req.query.productModeNe || "").trim();
      if (productModeNe) {
        filter["caseInfos.productMode"] = { $ne: productModeNe };
      }
    }

    const cacheKey = `my-requests:${String(req.user?._id || "")}:${String(
      req.user?.businessAnchorId || "",
    )}:${JSON.stringify({
      page,
      limit,
      manufacturerStage: req.query.manufacturerStage || "",
      manufacturerStageIn: req.query.manufacturerStageIn || "",
      implantType: req.query.implantType || "",
      productMode: req.query.productMode || "",
      productModeNe: req.query.productModeNe || "",
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
            designClaim: 1,
            designCompletedAt: 1,
            designLabBusinessAnchorId: 1,
            partnerBilling: 1,
            businessAnchorId: 1,
            shippingMode: 1,
            timeline: 1,
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

    // 접근 권한 확인 (의뢰자, 제조사, 관리자)
    // 제조사는 워크시트 프리뷰 silent refresh에서 camFile/finishLine 보강에 사용한다.
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    const isManufacturer = req.user.role === "manufacturer";
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

    if (!isRequestor && !isAdmin && !isManufacturer) {
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
      } else if (stageStatus === "준비") {
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

        // 의뢰자 헥스 회전 값 정규화 + 최종값 재계산
        if (
          Object.prototype.hasOwnProperty.call(
            updateData.caseInfos,
            "requestorHexRotation",
          )
        ) {
          const requestorHexRotation = normalizeHexRotationValue(
            updateData.caseInfos.requestorHexRotation,
          );
          updateData.caseInfos.requestorHexRotation = requestorHexRotation;
          const existingManufacturerHex = String(
            request?.rnd?.manufacturerHexRotation || "",
          ).trim();
          updateData.caseInfos.finalHexRotation = resolveFinalHexRotationValue({
            manufacturerHexRotation: existingManufacturerHex || undefined,
          });
        }

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

  if (!isAnySampleRequest(request)) {
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
  request.requestCategory = done
    ? REQUEST_CATEGORY.RND_SAMPLE
    : REQUEST_CATEGORY.COPIED_SAMPLE;

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
      requestCategory: request.requestCategory,
      restoredStage,
    },
  });
});

export const updateRndUnmachinableStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const unmachinable = Boolean(req.body?.unmachinable);
  const reason = String(req.body?.reason || "")
    .slice(0, 500)
    .trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 의뢰 ID입니다.",
    });
  }

  let request = await Request.findById(id);
  if (!request) {
    return res.status(404).json({
      success: false,
      message: "의뢰를 찾을 수 없습니다.",
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

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const requestInTx = await Request.findById(id).session(session);
      if (!requestInTx) {
        throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
      }

      const currentStage = String(requestInTx.manufacturerStage || "").trim();
      const currentStageLower = currentStage.toLowerCase();
      const now = new Date();
      const wasUnmachinable = Boolean(requestInTx?.rnd?.unmachinableAt);

      // 불완전가공(RnD unmachinable) 신규 판정 시, 가공 이후 단계 의뢰는 CAM으로 복귀한다.
      // 중요 정책:
      // - 불완전가공은 샘플이 아니다(유상 order 흐름의 품질 판정).
      // - 이미 CAM 승인으로 발생한 REQUEST_SPEND_COMMIT 차감은 유지한다.
      // - 즉, 이 경로에서는 크레딧/정산 장부를 수정(삭제/환불)하지 않는다.
      const isPostCamStage =
        currentStage === "가공" ||
        currentStage === "세척.패킹" ||
        currentStage === "포장.발송" ||
        currentStage === "추적관리" ||
        currentStage === "생산" ||
        currentStage === "세척.포장" ||
        currentStage === "발송" ||
        currentStageLower === "machining" ||
        currentStageLower === "production" ||
        currentStageLower === "packing" ||
        currentStageLower === "shipping" ||
        currentStageLower === "tracking";

      if (unmachinable && !wasUnmachinable && isPostCamStage) {
        bumpRollbackCount(requestInTx, "cam");
        // 작업 공정 변경: CAM은 더 이상 사용하지 않으므로 가공 단계로 바로 복귀한다.
        applyStatusMapping(requestInTx, "가공");
      }

      // 정책: 제조사/관리자의 "가공불가" 액션은
      // 가능성(potential) + 판정(judged)을 동시에 기록한다.
      // 판정 해제 시 confirmed(의뢰자 확인)도 함께 초기화한다.
      requestInTx.rnd = {
        ...(requestInTx.rnd || {}),
        unmachinablePotentialAt: unmachinable
          ? requestInTx.rnd?.unmachinablePotentialAt || now
          : null,
        unmachinablePotentialBy: unmachinable
          ? requestInTx.rnd?.unmachinablePotentialBy || req.user._id
          : null,
        unmachinableAt: unmachinable ? now : null,
        unmachinableBy: unmachinable ? req.user._id : null,
        unmachinableConfirmedAt: unmachinable
          ? requestInTx.rnd?.unmachinableConfirmedAt || null
          : null,
        unmachinableConfirmedBy: unmachinable
          ? requestInTx.rnd?.unmachinableConfirmedBy || null
          : null,
        unmachinableFromStage: unmachinable
          ? currentStage || null
          : String(requestInTx.rnd?.unmachinableFromStage || "").trim() || null,
        unmachinableReason: unmachinable ? reason : "",
        // 재판정 시 과거 의뢰자 "계속 진행" 이력은 초기화한다.
        requestorContinueAt: null,
        requestorContinueBy: null,
        requestorContinueMessage: "",
      };

      await requestInTx.save({ session });
      request = requestInTx;
    });
  } finally {
    session.endSession();
  }

  const requestorBusinessAnchorId = String(request.businessAnchorId || "").trim();

  // 대시보드 스냅샷/캐시도 즉시 무효화하여 읽음 카운트가 지연되지 않게 한다.
  if (requestorBusinessAnchorId) {
    try {
      await triggerDashboardSummaryRefreshForAnchorId(
        requestorBusinessAnchorId,
        "rnd-unmachinable-updated",
      );
    } catch (refreshError) {
      console.warn("[rnd-unmachinable] dashboard refresh trigger failed", {
        requestId: request.requestId,
        error: refreshError?.message,
      });
    }
  }

  emitAppEventToRoles(
    UNMACHINABLE_EVENT_ROLES,
    "request:rnd-unmachinable-updated",
    {
      requestId: request.requestId,
      requestMongoId: String(request._id || "").trim() || null,
      requestorBusinessAnchorId: requestorBusinessAnchorId || null,
      unmachinable: Boolean(request.rnd?.unmachinableAt),
      detailCode: resolveUnmachinableDetailCode(request),
      reason: String(request.rnd?.unmachinableReason || ""),
      request: {
        _id: request._id,
        requestId: request.requestId,
        manufacturerStage: request.manufacturerStage,
        businessAnchorId: request.businessAnchorId,
        requestorBusinessAnchorId: requestorBusinessAnchorId || null,
        rnd: {
          ...(request.rnd || {}),
          unmachinablePotentialAt: request.rnd?.unmachinablePotentialAt || null,
          unmachinableAt: request.rnd?.unmachinableAt || null,
          unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || null,
          unmachinableReason: String(request.rnd?.unmachinableReason || ""),
          unmachinableFromStage:
            String(request.rnd?.unmachinableFromStage || "") || null,
          requestorContinueAt: request.rnd?.requestorContinueAt || null,
          requestorContinueBy: request.rnd?.requestorContinueBy || null,
          requestorContinueMessage: String(
            request.rnd?.requestorContinueMessage || "",
          ),
        },
      },
    },
  );

  return res.status(200).json({
    success: true,
    data: {
      requestId: request.requestId,
      detailCode: resolveUnmachinableDetailCode(request),
      unmachinablePotentialAt: request.rnd?.unmachinablePotentialAt || null,
      unmachinableAt: request.rnd?.unmachinableAt || null,
      unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || null,
      unmachinableReason: String(request.rnd?.unmachinableReason || ""),
    },
  });
});

// related files:
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
export const continueRndUnmachinableByRequestor = asyncHandler(
  async (req, res) => {
    const { id } = req.params;

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

    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 진행 처리할 권한이 없습니다.",
      });
    }

    if (!request?.rnd?.unmachinableAt) {
      return res.status(400).json({
        success: false,
        message: "불완전가공 판정 의뢰만 진행 처리할 수 있습니다.",
      });
    }

    const now = new Date();
    const previousReason = String(request.rnd?.unmachinableReason || "").trim();
    const requestedMessageRaw = String(
      req.body?.requestorContinueMessage || req.body?.message || "",
    )
      .slice(0, 500)
      .trim();
    const requestorContinueMessage = requestedMessageRaw
      ? requestedMessageRaw
      : previousReason
        ? `의뢰자 요청: 문제 가능성을 인지하고 계속 가공 진행 요청 (불완전가공 사유: ${previousReason})`
        : "의뢰자 요청: 문제 가능성을 인지하고 계속 가공 진행 요청";

    request.rnd = {
      ...(request.rnd || {}),
      // 의뢰자 진행 선택 시 불완전가공 상태를 해제해 제조사 워크시트/대시보드에서 즉시 제외한다.
      unmachinablePotentialAt: null,
      unmachinablePotentialBy: null,
      unmachinableAt: null,
      unmachinableBy: null,
      unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || now,
      unmachinableConfirmedBy: request.rnd?.unmachinableConfirmedBy || req.user._id,
      unmachinableReason: "",
      requestorContinueAt: now,
      requestorContinueBy: req.user._id,
      requestorContinueMessage,
    };
    await request.save();

    const requestorBusinessAnchorId = String(request.businessAnchorId || "").trim();
    if (requestorBusinessAnchorId) {
      try {
        await triggerDashboardSummaryRefreshForAnchorId(
          requestorBusinessAnchorId,
          "rnd-unmachinable-continued",
        );
      } catch (refreshError) {
        console.warn("[rnd-unmachinable-continue] dashboard refresh trigger failed", {
          requestId: request.requestId,
          error: refreshError?.message,
        });
      }
    }

    emitAppEventToRoles(
      UNMACHINABLE_EVENT_ROLES,
      "request:rnd-unmachinable-updated",
      {
        requestId: request.requestId,
        requestMongoId: String(request._id || "").trim() || null,
        requestorBusinessAnchorId: requestorBusinessAnchorId || null,
        unmachinable: false,
        detailCode: resolveUnmachinableDetailCode(request),
        reason: "",
        request: {
          _id: request._id,
          requestId: request.requestId,
          manufacturerStage: request.manufacturerStage,
          businessAnchorId: request.businessAnchorId,
          requestorBusinessAnchorId: requestorBusinessAnchorId || null,
          rnd: {
            ...(request.rnd || {}),
            unmachinablePotentialAt: request.rnd?.unmachinablePotentialAt || null,
            unmachinableAt: request.rnd?.unmachinableAt || null,
            unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || null,
            unmachinableReason: String(request.rnd?.unmachinableReason || ""),
            unmachinableFromStage:
              String(request.rnd?.unmachinableFromStage || "") || null,
            requestorContinueAt: request.rnd?.requestorContinueAt || null,
            requestorContinueBy: request.rnd?.requestorContinueBy || null,
            requestorContinueMessage: String(
              request.rnd?.requestorContinueMessage || "",
            ),
          },
        },
      },
    );

    return res.status(200).json({
      success: true,
      data: {
        requestId: request.requestId,
        continuedAt: now,
        detailCode: resolveUnmachinableDetailCode(request),
        unmachinableAt: request.rnd?.unmachinableAt || null,
      },
    });
  },
);

export const confirmRndUnmachinableByRequestor = asyncHandler(
  async (req, res) => {
    const { id } = req.params;

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

    // 의뢰자 본인(또는 같은 조직)만 읽음(확인) 처리 가능
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 확인 처리할 권한이 없습니다.",
      });
    }

    // 판정 상태가 없으면 확인 처리할 수 없다.
    if (!request?.rnd?.unmachinableAt) {
      return res.status(400).json({
        success: false,
        message: "가공불가 판정 의뢰만 확인 처리할 수 있습니다.",
      });
    }

    const alreadyConfirmed = Boolean(request?.rnd?.unmachinableConfirmedAt);
    request.rnd = {
      ...(request.rnd || {}),
      unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || new Date(),
      unmachinableConfirmedBy: request.rnd?.unmachinableConfirmedBy || req.user._id,
    };
    await request.save();

    const requestorBusinessAnchorId = String(request.businessAnchorId || "").trim();

    if (requestorBusinessAnchorId) {
      try {
        await triggerDashboardSummaryRefreshForAnchorId(
          requestorBusinessAnchorId,
          "rnd-unmachinable-confirmed",
        );
      } catch (refreshError) {
        console.warn("[rnd-unmachinable-confirm] dashboard refresh trigger failed", {
          requestId: request.requestId,
          error: refreshError?.message,
        });
      }
    }

    // 읽음 상태 변화도 실시간 이벤트로 전파하여 제조사/관리자/기타 역할 대시보드에 즉시 반영한다.
    emitAppEventToRoles(
      UNMACHINABLE_EVENT_ROLES,
      "request:rnd-unmachinable-confirmed",
      {
        requestId: request.requestId,
        requestMongoId: String(request._id || "").trim() || null,
        requestorBusinessAnchorId: requestorBusinessAnchorId || null,
        detailCode: resolveUnmachinableDetailCode(request),
        confirmedByRole: String(req.user?.role || "").trim() || null,
        request: {
          _id: request._id,
          requestId: request.requestId,
          manufacturerStage: request.manufacturerStage,
          businessAnchorId: request.businessAnchorId,
          requestorBusinessAnchorId: requestorBusinessAnchorId || null,
          rnd: {
            ...(request.rnd || {}),
            unmachinablePotentialAt: request.rnd?.unmachinablePotentialAt || null,
            unmachinableAt: request.rnd?.unmachinableAt || null,
            unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || null,
            unmachinableReason: String(request.rnd?.unmachinableReason || ""),
            unmachinableFromStage:
              String(request.rnd?.unmachinableFromStage || "") || null,
            requestorContinueAt: request.rnd?.requestorContinueAt || null,
            requestorContinueBy: request.rnd?.requestorContinueBy || null,
            requestorContinueMessage: String(
              request.rnd?.requestorContinueMessage || "",
            ),
          },
        },
      },
    );

    return res.status(200).json({
      success: true,
      data: {
        requestId: request.requestId,
        alreadyConfirmed,
        detailCode: resolveUnmachinableDetailCode(request),
        unmachinableConfirmedAt: request.rnd?.unmachinableConfirmedAt || null,
      },
    });
  },
);

export const confirmAllRndUnmachinableByRequestor = asyncHandler(
  async (req, res) => {
    const scope = await buildRequestorOrgScopeFilter(req);

    const targetRequests = await Request.find({
      ...scope,
      "rnd.unmachinableAt": { $ne: null },
      "rnd.unmachinableConfirmedAt": null,
      manufacturerStage: { $ne: "취소" },
    })
      .select({ _id: 1, requestId: 1, businessAnchorId: 1, rnd: 1, manufacturerStage: 1 })
      .lean();

    if (!targetRequests.length) {
      return res.status(200).json({ success: true, data: { updatedCount: 0 } });
    }

    const now = new Date();
    const targetIds = targetRequests.map((row) => row._id);

    await Request.updateMany(
      { _id: { $in: targetIds } },
      {
        $set: {
          "rnd.unmachinableConfirmedAt": now,
          "rnd.unmachinableConfirmedBy": req.user._id,
        },
      },
    );

    // 영향받은 조직 스냅샷을 먼저 무효화하고,
    // 이후 개별 이벤트를 발행해 프론트 리스트를 즉시 동기화한다.
    const affectedAnchorIds = Array.from(
      new Set(
        targetRequests
          .map((row) => String(row?.businessAnchorId || "").trim())
          .filter(Boolean),
      ),
    );
    for (const anchorId of affectedAnchorIds) {
      try {
        await triggerDashboardSummaryRefreshForAnchorId(
          anchorId,
          "rnd-unmachinable-confirmed-batch",
        );
      } catch (refreshError) {
        console.warn("[rnd-unmachinable-confirm-all] dashboard refresh trigger failed", {
          anchorId,
          error: refreshError?.message,
        });
      }
    }

    // 배치 확인 처리도 개별 이벤트를 발행해 각 역할 대시보드가 즉시 반응하도록 한다.
    for (const row of targetRequests) {
      const requestorBusinessAnchorId = String(row.businessAnchorId || "").trim();
      emitAppEventToRoles(
        UNMACHINABLE_EVENT_ROLES,
        "request:rnd-unmachinable-confirmed",
        {
          requestId: row.requestId,
          requestMongoId: String(row._id || "").trim() || null,
          requestorBusinessAnchorId: requestorBusinessAnchorId || null,
          detailCode: "confirmed",
          confirmedByRole: String(req.user?.role || "").trim() || null,
          request: {
            _id: row._id,
            requestId: row.requestId,
            manufacturerStage: row.manufacturerStage,
            businessAnchorId: row.businessAnchorId,
            requestorBusinessAnchorId: requestorBusinessAnchorId || null,
            rnd: {
              ...(row.rnd || {}),
              unmachinablePotentialAt: row?.rnd?.unmachinablePotentialAt || null,
              unmachinableAt: row?.rnd?.unmachinableAt || null,
              unmachinableConfirmedAt: now,
              unmachinableReason: String(row?.rnd?.unmachinableReason || ""),
              unmachinableFromStage:
                String(row?.rnd?.unmachinableFromStage || "") || null,
            },
          },
        },
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        updatedCount: targetRequests.length,
      },
    });
  },
);

export const updateRequestAnodizingOverride = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hasAnodizingEnabled = Object.prototype.hasOwnProperty.call(
    req.body || {},
    "anodizingEnabled",
  );
  const anodizingEnabled = req.body?.anodizingEnabled;

  if (!hasAnodizingEnabled || typeof anodizingEnabled !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "anodizingEnabled(boolean) 값이 필요합니다.",
    });
  }

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

  // 정책: 제조사 아노다이징 override는 준비/가공 단계에서 허용한다.
  // (레거시 manufacturerStage=CAM 도 호환 허용)
  const currentManufacturerStage = String(request?.manufacturerStage || "").trim();
  const editableStages = new Set([
    "준비",
    "의뢰",
    "CAM",
    "가공",
    "request",
    "cam",
    "machining",
  ]);
  if (!editableStages.has(currentManufacturerStage)) {
    return res.status(409).json({
      success: false,
      message:
        "아노다이징 여부 override는 준비/가공 단계에서만 변경할 수 있습니다.",
    });
  }

  request.set("caseInfos.anodizingEnabled", anodizingEnabled);
  await request.save();

  const requestorBusinessAnchorId = String(request.businessAnchorId || "").trim();
  if (requestorBusinessAnchorId) {
    try {
      await triggerDashboardSummaryRefreshForAnchorId(
        requestorBusinessAnchorId,
        "request-anodizing-updated",
      );
    } catch (refreshError) {
      console.warn("[request-anodizing] dashboard refresh trigger failed", {
        requestId: request.requestId,
        error: refreshError?.message,
      });
    }
  }

  emitAppEventToRoles(
    REQUEST_HEX_ROTATION_EVENT_ROLES,
    "request:anodizing-updated",
    {
      requestId: request.requestId,
      requestMongoId: String(request._id || "").trim() || null,
      requestorBusinessAnchorId: requestorBusinessAnchorId || null,
      anodizingEnabled,
      request: {
        _id: request._id,
        requestId: request.requestId,
        manufacturerStage: request.manufacturerStage,
        businessAnchorId: request.businessAnchorId,
        requestorBusinessAnchorId: requestorBusinessAnchorId || null,
        caseInfos: {
          ...(request.caseInfos || {}),
          anodizingEnabled,
        },
      },
    },
  );

  return res.status(200).json({
    success: true,
    data: {
      requestId: request.requestId,
      manufacturerStage: request.manufacturerStage,
      anodizingEnabled,
    },
  });
});

export const updateRndHexRotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const manufacturerHexRotationInput = req.body?.manufacturerHexRotation;
  const manufacturerHexRotation = parseManufacturerHexRotationMode(
    manufacturerHexRotationInput,
  );

  if (!manufacturerHexRotation) {
    return res.status(400).json({
      success: false,
      message:
        "유효하지 않은 manufacturerHexRotation 값입니다. canonical 'STL모델대로' | '헥스30도회전' | '헥스X도회전(total)'만 사용할 수 있습니다.",
    });
  }

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

  // related files (hex rotation edit window):
  // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
  // - web/backend/controllers/requests/common.review.controller.js
  // 정책: 헥스 회전 설정/재설정은 의뢰 단계에서만 가능.
  // CAM 이상 단계에서는 고정되어 변경할 수 없다.
  const currentManufacturerStage = String(request?.manufacturerStage || "").trim();
  if (currentManufacturerStage && currentManufacturerStage !== "준비") {
    return res.status(409).json({
      success: false,
      message:
        "헥스 회전은 의뢰 단계에서만 설정/재설정할 수 있습니다. CAM 단계부터는 고정됩니다.",
    });
  }

  let requestorHexRotation;
  try {
    requestorHexRotation = normalizeHexRotationValue(
      request?.caseInfos?.requestorHexRotation,
    );
  } catch (hexModeError) {
    return res.status(409).json({
      success: false,
      message:
        hexModeError?.message ||
        "의뢰 데이터의 requestorHexRotation 값이 유효하지 않습니다.",
    });
  }
  const finalHexRotation = resolveFinalHexRotationValue({
    manufacturerHexRotation,
  });

  const requestorBusinessAnchorId = String(request.businessAnchorId || "").trim();

  request.set("rnd.manufacturerHexRotation", manufacturerHexRotation);
  request.set("rnd.manufacturerHexRotationUpdatedAt", new Date());
  request.set(
    "rnd.manufacturerHexRotationUpdatedBy",
    req.user?._id || null,
  );
  // related files:
  // - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
  // - web/backend/models/request.model.js
  request.set("caseInfos.requestorHexRotation", requestorHexRotation);
  request.set("caseInfos.manufacturerHexRotation", manufacturerHexRotation);
  request.set("caseInfos.finalHexRotation", finalHexRotation);
  const existingHexRotation =
    request.caseInfos?.hexRotation &&
    typeof request.caseInfos.hexRotation === "object"
      ? request.caseInfos.hexRotation
      : {};
  request.set("caseInfos.hexRotation", {
    ...existingHexRotation,
    mode: manufacturerHexRotation,
  });

  // 의뢰자 사업자 디폴트 헥스 회전값은 canonical 모드(STL모델대로/헥스30도회전/헥스X도회전(total))를 저장한다.
  if (Types.ObjectId.isValid(requestorBusinessAnchorId)) {
    await BusinessAnchor.updateOne(
      { _id: new Types.ObjectId(requestorBusinessAnchorId) },
      {
        $set: {
          "requestSettings.defaultManufacturerHexRotation":
            manufacturerHexRotation,
          "requestSettings.updatedAt": new Date(),
        },
      },
    );
  }

  await request.save();

  if (requestorBusinessAnchorId) {
    try {
      await triggerDashboardSummaryRefreshForAnchorId(
        requestorBusinessAnchorId,
        "rnd-hex-rotation-updated",
      );
    } catch (refreshError) {
      console.warn("[rnd-hex-rotation] dashboard refresh trigger failed", {
        requestId: request.requestId,
        error: refreshError?.message,
      });
    }
  }

  emitAppEventToRoles(
    REQUEST_HEX_ROTATION_EVENT_ROLES,
    "request:hex-rotation-updated",
    {
      requestId: request.requestId,
      requestMongoId: String(request._id || "").trim() || null,
      requestorBusinessAnchorId: requestorBusinessAnchorId || null,
      requestorHexRotation,
      manufacturerHexRotation,
      finalHexRotation,
      request: {
        _id: request._id,
        requestId: request.requestId,
        manufacturerStage: request.manufacturerStage,
        businessAnchorId: request.businessAnchorId,
        requestorBusinessAnchorId: requestorBusinessAnchorId || null,
        caseInfos: {
          requestorHexRotation,
          manufacturerHexRotation,
          finalHexRotation,
          hexRotation: request.caseInfos?.hexRotation || { mode: manufacturerHexRotation },
        },
        rnd: {
          manufacturerHexRotation,
          manufacturerHexRotationUpdatedAt:
            request.rnd?.manufacturerHexRotationUpdatedAt || null,
          manufacturerHexRotationUpdatedBy:
            request.rnd?.manufacturerHexRotationUpdatedBy || null,
        },
      },
    },
  );

  return res.status(200).json({
    success: true,
    data: {
      requestId: request.requestId,
      requestorHexRotation,
      manufacturerHexRotation,
      finalHexRotation,
      hexRotation: request.caseInfos?.hexRotation || { mode: manufacturerHexRotation },
      manufacturerHexRotationUpdatedAt:
        request.rnd?.manufacturerHexRotationUpdatedAt || null,
      manufacturerHexRotationUpdatedBy:
        request.rnd?.manufacturerHexRotationUpdatedBy || null,
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

  if (!isRndSampleRequest(request)) {
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
    let request = await Request.findById(requestId).populate(
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

    // 취소는 기본적으로 준비 단계에서만 가능.
    // 단, 제조사에서 불완전가공 판정을 내린 의뢰(rnd.unmachinableAt 존재)는
    // 의뢰자 판단으로 취소를 허용한다.
    if (manufacturerStage === "취소") {
      const currentStage = String(request.manufacturerStage || "").trim();
      // manufacturerStage request 단계 SSOT는 `준비` (레거시 `의뢰`/`request`/`CAM` 저장·비교 금지).
      // 취소 허용 판정은 정규화 결과 `request`(=준비)만 본다.
      const isPrepStage = normalizeRequestStage(request) === "request";
      const isUnmachinable = Boolean(request?.rnd?.unmachinableAt);
      const isStageAllowed = isPrepStage || isUnmachinable;

      console.log("[updateManufacturerStage] Cancel validation", {
        requestId: request.requestId,
        currentStage,
        isPrepStage,
        isUnmachinable,
        isStageAllowed,
      });

      if (!isStageAllowed) {
        return res.status(400).json({
          success: false,
          message:
            "준비 단계에서만 취소할 수 있습니다. 단, 불완전가공 판정 의뢰는 취소 가능합니다.",
        });
      }
    }

    const prevManufacturerStage = String(request.manufacturerStage || "").trim();
    const deferredCreditEvents = [];

    // 의뢰 상태 변경
    if (manufacturerStage === "취소") {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await ensureRequestCancelRollbackDelete({
            request,
            actorUserId: req.user?._id || null,
            session,
            deferredCreditEvents,
          });
          applyStatusMapping(request, manufacturerStage);
          await request.save({ session });
        });
      } finally {
        session.endSession();
      }

      // 중요: 크레딧 이벤트는 트랜잭션 커밋 이후 발행한다.
      // 수신측(DashboardLayout)은 credit:balance-updated 수신 후 /api/credits/balance를 silent refetch한다.
      const requestorAnchorIdForCredit = String(
        request.businessAnchorId || request.requestor?.businessAnchorId || "",
      ).trim();
      if (requestorAnchorIdForCredit) {
        const rollbackDelta = deferredCreditEvents.reduce(
          (sum, evt) => sum + Number(evt?.balanceDelta || 0),
          0,
        );

        try {
          await emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: requestorAnchorIdForCredit,
            balanceDelta: Number.isFinite(rollbackDelta) ? rollbackDelta : 0,
            reason: "request_cancel",
            refId: request._id,
            // 준비 단계 취소(차감 없음, delta=0)에서도 헤더 잔액 동기화 refetch를 유도한다.
            forceEmit: true,
          });
        } catch (emitErr) {
          console.error("[updateManufacturerStage] credit emit failed", {
            requestId: request.requestId || null,
            requestMongoId: request._id ? String(request._id) : null,
            message: emitErr?.message || String(emitErr || ""),
          });
        }
      }
    } else {
      applyStatusMapping(request, manufacturerStage);
      await request.save();
    }

    // 신속배송(express) 표시/우선순위는 finalShipping.mode / shippingMode SSOT 사용

    const legacyHexNormalized = normalizeLegacyManufacturerHexRotationOnRequest(
      request,
    );

    if (legacyHexNormalized) {
      console.info("[updateManufacturerStage] normalized legacy manufacturer hex mode", {
        requestId: request.requestId,
        requestMongoId: String(request._id || ""),
      });
    }

    console.log("[updateManufacturerStage] Stage updated", {
      requestId: request.requestId,
      newStage: manufacturerStage,
      businessAnchorId: String(request.businessAnchorId || ""),
    });

    // 취소 시 웹소켓 실시간 이벤트 발행 (requestor/manufacturer/admin)
    if (manufacturerStage === "취소") {
      const normalizedRequest = await normalizeRequestForResponse(request);
      const requestMongoId = String(request._id || "").trim();
      const requestorAnchorId = String(request.businessAnchorId || "").trim();

      emitAppEventToRoles(
        ["requestor", "manufacturer", "admin"],
        "request:stage-changed",
        {
          source: "requestor-recent-cancel",
          requestId: request.requestId || null,
          requestMongoId: requestMongoId || null,
          fromStage: prevManufacturerStage || null,
          toStage: "취소",
          businessAnchorId: requestorAnchorId || null,
          ownerBusinessAnchorId: requestorAnchorId || null,
          requestorBusinessAnchorId: requestorAnchorId || null,
          manufacturerStage: "취소",
          request: normalizedRequest,
        },
      );

      if (prevManufacturerStage && prevManufacturerStage !== "취소") {
        emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
          source: "requestor-cancel",
          action: "canceled",
          stage: prevManufacturerStage,
          delta: -1,
          requestId: request.requestId || null,
          requestMongoId: requestMongoId || null,
          requestCategory: resolveRequestCategory(request),
        });
      }
    }

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
    const isSampleRequest = isAnySampleRequest(request);

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

    // 단계 검증: 관리자면 가공(machining) 단계 이전까지, 의뢰자면 준비 단계만 허용
    const stageStatus = String(request.manufacturerStage || "");

    // R&D 샘플은 제조사 조직 임직원/관리자가 완전 삭제
    if (isSampleRequest && (isAdmin || isSampleManufacturerOrgMember)) {
      await Request.findByIdAndDelete(request._id);

      console.log("[deleteRequest] 샘플 의뢰 완전 삭제", {
        requestId: request.requestId,
        deletedBy: req.user._id,
      });

      // 웹소켓: 카운트 업데이트 (감소)
      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
        stage: stageStatus,
        delta: -1,
        requestId: request.requestId,
        source: "manufacturer_sample",
        requestCategory: resolveRequestCategory(request),
        action: "deleted",
      });

      res.status(200).json({
        success: true,
        message: "샘플 의뢰가 완전히 삭제되었습니다.",
      });
      return;
    }

    const normalizedStageKey = normalizeRequestStage(request);
    const isRequestorDeletable = normalizedStageKey === "request";
    const isAdminDeletable = ["request", "cam", "machining"].includes(
      normalizedStageKey,
    );

    if ((isAdmin && !isAdminDeletable) || (!isAdmin && !isRequestorDeletable)) {
      return res.status(400).json({
        success: false,
        message: isAdmin
          ? "발송 단계 이후의 의뢰는 삭제할 수 없습니다."
          : "준비 단계의 의뢰만 직접 삭제할 수 있습니다. 고객센터에 문의해주세요.",
      });
    }

    // 의뢰 취소 처리 (상태를 '취소'로 변경)
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ensureRequestCancelRollbackDelete({
          request,
          actorUserId: req.user?._id || null,
          session,
        });

        applyStatusMapping(request, "취소");
        await request.save({ session });
      });
    } finally {
      session.endSession();
    }

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

const CLONE_START_STAGE_VALUES = ["준비", "CAM", "가공", "세척.패킹"];

function parseCloneStartStage(
  value,
  { allowMachining = true, defaultStage = "준비" } = {},
) {
  const raw = String(value || "").trim();
  const allowed = allowMachining ? CLONE_START_STAGE_VALUES : ["준비", "CAM"];
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
  const isFromRequest = startStage === "준비";
  const isFromMachining = startStage === "가공";
  const isFromPacking = startStage === "세척.패킹";

  return {
    request: {
      status: isFromRequest ? "PENDING" : "APPROVED",
      updatedAt: now,
    },
    cam: {
      status: isFromMachining || isFromPacking ? "APPROVED" : "PENDING",
      updatedAt: isFromMachining || isFromPacking ? now : null,
    },
    machining: {
      status: isFromPacking ? "APPROVED" : "PENDING",
      updatedAt: isFromPacking ? now : null,
    },
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

  // 시작 공정 복사 정책 (생산 샘플 복사 공통):
  // - 의뢰 시작: CAM(filled STL)은 유지, NC는 제거
  //   -> 의뢰자 과금/결제 상태와 무관한 가공 입력 데이터는 복사하고,
  //      NC 산출물은 공정 재생성을 위해 비운다.
  // - CAM 시작: CAM은 유지, NC는 제거 (재생성 가능)
  // - 가공/세척.패킹 시작: CAM/NC 모두 유지
  if (startStage === "가공" || startStage === "세척.패킹") {
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
    camFile: sourceCaseInfos?.camFile || null,
    ncFile: null,
  };
}

/**
 * 의뢰건을 내부 샘플로 복사
 * - 기존 의뢰건은 완료/진행 상태 그대로 유지 (원본 불변)
 * - 복사본은 제조사 내부 테스트/개발용으로 사용 (크레딧 미소비)
 * - 복사본은 R&D 탭에 즉시 보관되도록 생성 (`source=manufacturer_sample`, `rnd.doneAt!=null`)
 * - 원본 단계/배송정보/크레딧에는 영향 없이 분리 저장
 * - 허용 원본 단계: 의뢰, CAM, 세척.패킹, 추적관리, 배송완료 건
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
      // - 기존 허용: 세척.패킹/추적관리/배송완료
      // - 확장 허용: 의뢰/CAM (워크시트 의뢰, CAM 탭에서 R&D 저장)
      const stage = String(request.manufacturerStage || "").trim();
      const di = request.deliveryInfoRef || {};
      const isDelivered = !!di.deliveredAt;
      const isTrackingStage = stage === "추적관리";
      const isPackingStage = stage === "세척.패킹" || stage === "세척.포장";
      const isRequestStage = stage === "준비";
      const isCamStage = stage === "CAM" || stage.toLowerCase() === "cam";

      if (
        !isRequestStage &&
        !isCamStage &&
        !isTrackingStage &&
        !isDelivered &&
        !isPackingStage
      ) {
        throw new ApiError(
          400,
          "의뢰, CAM, 세척.패킹 진행중, 추적관리 완료 또는 배송 완료된 의뢰건만 샘플 복사가 가능합니다.",
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
        requestCategory: REQUEST_CATEGORY.RND_SAMPLE,
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
        // 로트번호는 원본 재사용 금지(복사본 전용 번호 사용)
        // 재질 정보는 원본 재질을 초기값으로 가져오고, value는 새로 발급한다.
        lotNumber: {
          material: String(lotMaterial || "").trim() || null,
          value: null,
        },
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

      // 정책: R&D 샘플도 복사 샘플과 동일하게 원본과 다른 별도 로트번호를 즉시 발급한다.
      await ensureLotNumberForMachining(newRequest);

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
        requestCategory: REQUEST_CATEGORY.RND_SAMPLE,
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
          requestCategory: newRequest.requestCategory,
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
 * R&D 샘플 의뢰를 '준비' 탭 작업용으로 복사
 * - 원본 R&D 샘플은 유지
 * - 복사본은 source=manufacturer_sample, rnd.doneAt=null, manufacturerStage='준비'
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

      if (!isRndSampleRequest(request)) {
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
        requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE,
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

      // 정책: 복사 시작 공정과 무관하게 원본과 다른 별도 로트번호를 즉시 발급한다.
      // 준비 탭 복사본도 의뢰카드에 3글자 로트를 표시해야 한다.
      await ensureLotNumberForMachining(clonedRequest);

      await clonedRequest.save({ session });

      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
        stage:
          startStage === "준비"
            ? "request"
            : startStage === "CAM"
              ? "cam"
              : "machining",
        delta: 1,
        requestId: clonedRequest.requestId,
        source: "manufacturer_sample",
        requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE,
        originalRequestId: request.requestId,
      });

      res.status(201).json({
        success: true,
        message: `R&D 샘플이 ${startStage} 공정으로 복사되었습니다.`,
        data: {
          requestId: clonedRequest.requestId,
          originalRequestId: request.requestId,
          source: clonedRequest.source,
          requestCategory: clonedRequest.requestCategory,
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
 * 추적관리 대상 의뢰건을 선택 공정(의뢰/CAM/가공)으로 재제작 복사
 * - 원본 의뢰는 유지
 * - 복사본은 source=manufacturer_sample, rnd.doneAt=null 로 생성
 * - 프론트에서 카드 선택 또는 기간 선택으로 requestIds를 만들어 전달한다.
 * @route POST /api/requests/recall-clone (legacy)
 * @route POST /api/requests/remake-clone
 */
export async function cloneRequestsForRecall(req, res) {
  try {
    if (!["manufacturer", "admin"].includes(String(req.user?.role || ""))) {
      throw new ApiError(403, "제조사 또는 관리자만 재제작 복사가 가능합니다.");
    }

    const startStage = parseCloneStartStage(req.body?.startStage, {
      allowMachining: true,
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
      throw new ApiError(400, "재제작할 의뢰를 하나 이상 선택해주세요.");
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
          requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE,
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
              status: "재제작 복사 생성",
              note: `원본 의뢰: ${sourceRequest.requestId}, 시작 공정: ${startStage}`,
              updatedBy: req.user._id,
              updatedAt: now,
            },
          ],
        });

        // 정책: 재제작 복사본도 시작 공정과 무관하게 새 lotNumber를 즉시 발급한다.
        await ensureLotNumberForMachining(clonedRequest);

        await clonedRequest.save();

        emitAppEventToRoles(
          ["manufacturer", "admin"],
          "worksheet:count-update",
          {
            stage:
              startStage === "준비"
                ? "request"
                : startStage === "CAM"
                  ? "cam"
                  : "machining",
            delta: 1,
            requestId: clonedRequest.requestId,
            source: "manufacturer_sample",
            requestCategory: REQUEST_CATEGORY.COPIED_SAMPLE,
            originalRequestId: sourceRequest.requestId,
          },
        );

        created.push({
          sourceRequestId: sourceRequest.requestId,
          clonedRequestId: clonedRequest.requestId,
          requestCategory: clonedRequest.requestCategory,
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
      message: `재제작 복사 완료 (${created.length}건 성공${failed.length ? `, ${failed.length}건 실패` : ""})`,
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
      message: "재제작 복사 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}
