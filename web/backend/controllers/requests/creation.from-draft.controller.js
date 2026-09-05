// related files:
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/creation.request.controller.js
// - web/backend/controllers/requests/expressSelectable.utils.js
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// - web/backend/rules.md
// change-log:
// - 2026-08-21: 잔액 사전검사 후 insert만 txn. credit hold·stage-changed는 201 finish·스냅샷 이후.
// - 2026-08-21: 헥스 확인 샘플 생성·대시보드 refresh를 201 finish 이후로 미룸(제출 응답 단축).
// - 2026-08-21: 제출 지연 단축. 대시보드 refresh는 201 전송 이후, 응답 data는 requestIds lean.
// - 2026-08-21: 아노 미설정 폴백을 의뢰자 개인 requestSettings 우선(사업체→기본 ON). 사업체-only race 완화.
// - 2026-08-19: 제출 트랜잭션에서 크레딧 보류는 잔액 집계 1회·가드 1회로 재사용.
// - 2026-08-19: 제출 지연 단축. 공휴일/devops prefetch, 리메이크 가격 조회 생략,
//   생산스케줄 memo, requestId 로컬 생성, 세션 시작 병렬.
// - 2026-08-19: 제출 지연 단축. 설정/리드타임 캐시, 사업자 1회 조회, 잔액 집계는 트랜잭션 안 1회,
//   성공 후 크레딧 소켓은 응답을 막지 않음.
// - 2026-08-19: 의뢰 생성 후 GET /my 메모리 캐시 무효화(진행중 목록이 비어 보이는 문제).
// - 2026-08-18: 생산 의뢰는 준비 단계 진입(생성) 시 로트번호(3글자)를 발급한다.
// - 2026-08-13: 제출 지연 단축. 설정/리드타임/크레딧을 트랜잭션 밖 병렬 prefetch,
//   incoming caseInfos.file.s3Key를 받아 Draft PATCH 왕복 생략.
// - 2026-08-11: 아노다이징은 의뢰건 caseInfos 우선, 미설정 시 사업체 기본값(ON) 폴백.
// - 2026-08-10: caseInfos.files에서 primary s3Key 중복 저장 방지.
// - 2026-08-08: 접수 시 신속 ETA 이점 없으면 express→normal 강등.
import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import User from "../../models/user.model.js";
import {
  normalizeExoCadVersion,
  normalizeHexVerificationResultHex,
  isHexVerificationPending,
  resolveExoCadManufacturerHexRotation,
  resolveHexRotationByDesignSoftware,
} from "../../utils/designSoftwareHex.js";
import { maybeCreateHexVerificationSampleForFirstOrder } from "../../services/hexVerificationSample.service.js";
import {
  normalizeCaseInfosImplantFields,
  ensureReviewByStageDefaults,
  assertOrderableImplantPresetOrThrow,
  ensureLotNumbersOnReadyEnter,
} from "./utils.js";
import {
  computePriceForRequest,
  resolveRequestorPricingBaseDate,
  canAccessRequestAsRequestor,
  buildRequestorOrgScopeFilter,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  getRequestorOrgId,
  normalizeRequestStage,
  REQUEST_STAGE_ORDER,
} from "./utils.js";
import {
  calculateInitialProductionSchedule,
  createProductionScheduleMemo,
  resolveLeadDaysWithSameDayCutoff,
} from "./production.utils.js";
import { getManufacturerLeadTimesUtil } from "../businesses/leadTime.controller.js";
import { loadCreditSettingsDefaults } from "../../utils/creditSettingsDefaults.js";
import { prefetchKoreanHolidaysForYears } from "../../utils/krBusinessDays.js";
import {
  countDesignAbutmentQty,
  resolveMachiningSpendAmount,
  resolveQuotedPriceWithExtras,
} from "./designPrice.utils.js";
import {
  applySignupFreeTestPricingToBatch,
  getSignupFreeTestQuota,
  isSignupFreeTestPriceRule,
} from "./signupFreeTest.utils.js";
import { resolveSelectableShippingMode } from "./expressSelectable.utils.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { holdRequestCreditsOnSubmit, resolveDevopsEscrowOwnerId } from "../../services/requestCreditHold.service.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";
import { emitDesignClaimChanged } from "../../utils/designClaimRealtime.js";
import {
  buildStandardStlFileName,
  getBusinessCreditBalanceBreakdown,
  isDuplicateKeyError,
} from "./creation.helpers.controller.js";

const REQUEST_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const REQUEST_ID_SUFFIX_LEN = 8;
const REQUEST_ID_MAX_TRIES = 8;

const normalizeRetentionGroove = (value) => {
  const rg = String(value || "")
    .trim()
    .toLowerCase();
  if (rg === "deep") return "deep";
  if (rg === "none" || rg === "shallow") return "none";
  return "deep";
};

const normalizeRequestorHexRotation = (value, fallback = "STL모델대로") => {
  const v = String(value || "").trim();
  if (v === "헥스30도회전" || v === "30") return "헥스30도회전";
  if (v === "STL모델대로" || v === "0") return "STL모델대로";
  return String(fallback || "").trim() === "헥스30도회전"
    ? "헥스30도회전"
    : "STL모델대로";
};

// related files:
// - web/backend/models/draftRequest.model.js
// - web/backend/models/request.model.js
// - web/backend/controllers/chats/chat.controller.js
// practice 전송 라우팅 SSOT (치과 -> 기공소)
const isPracticeRoutingTag = (tag) => {
  const t = String(tag || "").trim();
  return t === "practice_dropzone" || t === "practice_file_transfer";
};

const normalizePracticeRouting = (value) => {
  const src = value && typeof value === "object" ? value : {};
  const targetLabAnchorIdRaw = String(src?.targetLabAnchorId || "").trim();
  const targetLabName = String(src?.targetLabName || "").trim();

  const targetLabAnchorId =
    targetLabAnchorIdRaw && Types.ObjectId.isValid(targetLabAnchorIdRaw)
      ? targetLabAnchorIdRaw
      : "";

  if (!targetLabAnchorId && !targetLabName) return undefined;

  return {
    targetLabAnchorId: targetLabAnchorId || null,
    targetLabName,
  };
};

const normalizeDesignSoftware = (value) => {
  const v = String(value || "").trim();
  return v || "";
};

const normalizeManufacturerHexRotationModeOrNull = (value) => {
  const v = String(value || "").trim();
  if (!v) return null;
  if (v === "헥스30도회전") return "헥스30도회전";
  if (v === "STL모델대로") return "STL모델대로";
  if (v === "STL모델+") return "STL모델+";
  if (v === "헥스30+") return "헥스30+";
  if (v === "헥스40도회전" || v === "헥스10도회전") return "STL모델+";

  const matched = v.match(/^헥스\s*([+-]?\d+(?:\.\d+)?)\s*도회전$/);
  if (!matched) return null;
  const parsedX = Number(matched[1]);
  if (!Number.isFinite(parsedX)) return null;
  if (parsedX === 30) return "헥스30도회전";
  return "STL모델+";
};

const resolveFinalHexRotationValue = ({
  manufacturerHexRotation,
}) => {
  const mode = normalizeManufacturerHexRotationModeOrNull(manufacturerHexRotation);
  if (
    mode === "STL모델대로" ||
    mode === "헥스30도회전" ||
    mode === "STL모델+" ||
    mode === "헥스30+"
  ) {
    return mode;
  }
  return "STL모델대로";
};

const buildRequestIdPrefix = () => {
  // KST 기준 날짜
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return kstDate.replace(/-/g, "");
};

const makeRequestSuffix = () => {
  const bytes = crypto.randomBytes(REQUEST_ID_SUFFIX_LEN);
  let out = "";
  for (let i = 0; i < REQUEST_ID_SUFFIX_LEN; i += 1) {
    out += REQUEST_ID_ALPHABET[bytes[i] % REQUEST_ID_ALPHABET.length];
  }
  return out;
};

const generateRequestIdBatch = (count) => {
  const prefix = buildRequestIdPrefix();
  const requestIds = [];
  const seen = new Set();
  const n = Math.max(0, Math.floor(Number(count) || 0));
  for (let i = 0; i < n; i += 1) {
    let candidate = `${prefix}-${makeRequestSuffix()}`;
    let tries = 0;
    while (seen.has(candidate) && tries < REQUEST_ID_MAX_TRIES) {
      candidate = `${prefix}-${makeRequestSuffix()}`;
      tries += 1;
    }
    if (seen.has(candidate)) {
      throw new Error("requestId 생성에 실패했습니다.");
    }
    seen.add(candidate);
    requestIds.push(candidate);
  }
  return requestIds;
};

const MONTHLY_REMAKE_FREE_LIMIT = 3;
const REMAKE_PRICE_RULES = [
  "remake_monthly_free_3",
  "remake_general_pricing",
  "remake_fixed_10000",
];

const getMonthlyRemakeQuota = async ({ scopeFilter }) => {
  const todayYmd = getTodayYmdInKst();
  const [year, month] = String(todayYmd)
    .split("-")
    .map((v) => Number(v || 0));
  const monthStartYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthStartKst = new Date(`${monthStartYmd}T00:00:00+09:00`);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYmd = `${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const nextMonthStartKst = new Date(`${nextMonthYmd}T00:00:00+09:00`);

  const used = await Request.countDocuments({
    ...scopeFilter,
    manufacturerStage: { $ne: "취소" },
    createdAt: { $gte: monthStartKst, $lt: nextMonthStartKst },
    "price.rule": { $in: REMAKE_PRICE_RULES },
  });

  return {
    limit: MONTHLY_REMAKE_FREE_LIMIT,
    used,
    remaining: Math.max(0, MONTHLY_REMAKE_FREE_LIMIT - used),
    currentMonthStartYmd: monthStartYmd,
    currentMonthEndExclusiveYmd: nextMonthYmd,
  };
};

/**
 * ===== 신규 의뢰 생성 표준 엔드포인트 (SSOT) =====
 * Draft 기반 워크플로우: 파일 업로드 → Draft 생성 → Draft 수정 → Request로 전환
 *
 * Draft를 Request로 전환 (다건 지원)
 * - 중복 체크, 크레딧 사전 체크, 트랜잭션 처리 포함
 * - 프론트엔드: useNewRequestSubmitV2.ts
 * - 참고: rules.legacy-full.md 섹션 4.3.2 "신규 의뢰 생성 엔드포인트 (SSOT)"
 *
 * @route POST /api/requests/from-draft
 */
export async function createRequestsFromDraft(req, res) {
  try {
    const startTime = Date.now();
    console.log("[createRequestsFromDraft] start", {
      t: 0,
      draftId: req.body?.draftId,
    });
    const { draftId, clinicId } = req.body || {};
    const enableDuplicateRequestCheck = true;
    const duplicateResolutionsRaw = Array.isArray(
      req.body?.duplicateResolutions,
    )
      ? req.body.duplicateResolutions
      : null;
    const duplicateResolutions = enableDuplicateRequestCheck
      ? Array.isArray(duplicateResolutionsRaw)
        ? duplicateResolutionsRaw
            .filter((r) => r && typeof r === "object")
            .map((r) => ({
              caseId: String(r.caseId || "").trim(),
              strategy: String(r.strategy || "").trim(),
              existingRequestId: String(r.existingRequestId || "").trim(),
            }))
            .filter((r) => r.caseId && r.strategy)
        : null
      : null;

    if (!draftId || !Types.ObjectId.isValid(draftId)) {
      return res.status(400).json({
        success: false,
        message: "유효한 draftId가 필요합니다.",
      });
    }

    const earlyOrgId =
      req.user?.role === "requestor" ? getRequestorOrgId(req) : null;
    const shippingOrgIdEarly = String(
      req.user?.businessAnchorId || earlyOrgId || "",
    );
    const kstYear = Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
      }).format(new Date()),
    );
    const [
      draft,
      lockStatus,
      creditSettingsBase,
      manufacturerSettings,
      shippingOrg,
      devopsAnchorIdPrefetch,
      ,
      requestorSettingsDoc,
    ] =
      await Promise.all([
        DraftRequest.findById(draftId).lean(),
        earlyOrgId && Types.ObjectId.isValid(earlyOrgId)
          ? checkCreditLock(earlyOrgId)
          : Promise.resolve({ isLocked: false }),
        loadCreditSettingsDefaults(),
        getManufacturerLeadTimesUtil().catch(() => null),
        shippingOrgIdEarly && Types.ObjectId.isValid(shippingOrgIdEarly)
          ? BusinessAnchor.findById(shippingOrgIdEarly)
              .select({
                "shippingPolicy.weeklyBatchDays": 1,
                "requestSettings.anodizingEnabled": 1,
                "requestSettings.defaultRequestorHexRotation": 1,
                "requestSettings.defaultManufacturerHexRotation": 1,
                "requestSettings.designSoftware": 1,
                "requestSettings.exoCadVersion": 1,
                "requestSettings.hexVerificationResultHex": 1,
                "requestSettings.hexByImplantManufacturer": 1,
                requestorKind: 1,
                "verification.verifiedAt": 1,
                createdAt: 1,
              })
              .lean()
          : Promise.resolve(null),
        resolveDevopsEscrowOwnerId().catch(() => null),
        prefetchKoreanHolidaysForYears(
          Number.isFinite(kstYear) ? [kstYear, kstYear + 1] : [],
        ),
        req.user?._id
          ? User.findById(req.user._id)
              .select({
                "requestSettings.anodizingEnabled": 1,
                "requestSettings.defaultManufacturerHexRotation": 1,
                "requestSettings.designSoftware": 1,
                "requestSettings.exoCadVersion": 1,
                "requestSettings.hexVerificationResultHex": 1,
                "requestSettings.hexByImplantManufacturer": 1,
              })
              .lean()
          : Promise.resolve(null),
      ]);
    const creditSettings = earlyOrgId
      ? await loadCreditSettingsDefaults({
          requestorOrgId: earlyOrgId,
          requestorAnchor: shippingOrg,
        })
      : creditSettingsBase;
    const pricingBaseDate =
      shippingOrg?.verification?.verifiedAt ||
      shippingOrg?.createdAt ||
      (await resolveRequestorPricingBaseDate({
        requestorId: req.user?._id,
        requestorOrgId: earlyOrgId,
      }).catch(() => null));
    const manufacturerLeadTimes = manufacturerSettings?.leadTimes || null;
    console.log("[createRequestsFromDraft] draft loaded", {
      t: Date.now() - startTime,
      found: Boolean(draft),
    });

    if (!draft) {
      return res.status(404).json({
        success: false,
        message: "Draft를 찾을 수 없습니다.",
      });
    }

    if (draft.requestor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "이 Draft에 대한 권한이 없습니다.",
      });
    }

    // related files:
    // - web/backend/models/practiceTransfer.model.js
    // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
    // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
    // practice 제출은 Request 컬렉션 경유 금지 (PracticeTransfer SSOT)
    if (req.user?.role === "practice") {
      return res.status(403).json({
        success: false,
        message: "practice 제출은 /api/practice/transfers 경로만 사용할 수 있습니다.",
      });
    }

    const draftCaseInfos = Array.isArray(draft.caseInfos)
      ? draft.caseInfos
      : [];
    const isPracticeRoutingDraft =
      req.user?.role === "practice" &&
      draftCaseInfos.length > 0 &&
      draftCaseInfos.every((ci) =>
        isPracticeRoutingTag(ci?.newSystemRequest?.tag),
      );

    if (req.user?.role === "requestor") {
      if (!earlyOrgId || !Types.ObjectId.isValid(earlyOrgId)) {
        return res.status(403).json({
          success: false,
          message:
            "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
        });
      }
      if (lockStatus.isLocked && !isPracticeRoutingDraft) {
        return res.status(403).json({
          success: false,
          message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
          lockedAt: lockStatus.lockedAt,
        });
      }
    }

    let caseInfosArray = draftCaseInfos;
    if (Array.isArray(req.body.caseInfos) && req.body.caseInfos.length > 0) {
      const incoming = req.body.caseInfos;
      caseInfosArray = incoming.map((incomingCi, idx) => {
        const incomingName = String(
          incomingCi?.file?.originalName || "",
        ).trim();
        const draftCi =
          (incomingName &&
            draftCaseInfos.find(
              (d) =>
                String(d?.file?.originalName || "").trim() === incomingName,
            )) ||
          draftCaseInfos[idx] ||
          {};
        const incomingFile = incomingCi?.file?.s3Key
          ? incomingCi.file
          : draftCi.file;
        return {
          ...draftCi,
          ...incomingCi,
          _id: draftCi._id || incomingCi._id,
          file: incomingFile,
          files: Array.isArray(incomingCi?.files)
            ? incomingCi.files
            : draftCi.files,
          workType: (incomingCi.workType || draftCi.workType || "abutment").trim(),
        };
      });
    }

    if (!caseInfosArray.length) {
      return res.status(400).json({
        success: false,
        message: "Draft에 caseInfos가 없습니다.",
      });
    }

    const abutmentCases = caseInfosArray.filter(
      (ci) => (ci.workType || "abutment").trim() === "abutment",
    );

    if (!abutmentCases.length) {
      return res.status(400).json({
        success: false,
        message: "Draft에 커스텀 어벗 케이스가 없습니다.",
      });
    }

    const createdRequests = [];
    const missingFieldsByFile = [];
    const preparedCases = [];

    console.log("[createRequestsFromDraft] normalize cases start", {
      t: Date.now() - startTime,
      abutmentCount: abutmentCases.length,
    });
    const preparedCandidates = await Promise.all(
      abutmentCases.map(async (ci, idx) => {
        const caseStart = Date.now();
        const normalizedCi = await normalizeCaseInfosImplantFields(
          ci || {},
          false,
        );
        console.log("[createRequestsFromDraft] normalize case", {
          t: Date.now() - startTime,
          idx,
          dt: Date.now() - caseStart,
        });

        const patientName = (ci?.patientName || "").trim();
        const tooth = (ci?.tooth || "").trim();
        const clinicName = (ci?.clinicName || "").trim();
        const workType = (ci?.workType || "abutment").trim();
        if (workType !== "abutment") return null;

        const shippingMode =
          ci?.shippingMode === "express" ? "express" : "normal";
        const requestedShipDate = ci?.requestedShipDate || undefined;

        const designSoftwareValue = normalizeDesignSoftware(ci?.designSoftware);

        const missing = [];
        if (!clinicName) missing.push("치과이름");
        if (!patientName) missing.push("환자이름");
        if (!designSoftwareValue) missing.push("디자인 소프트웨어");

        // 신규 임플란트 의뢰(newSystemRequest)가 아닌 경우 임플란트 필드 검증
        // strict=false로 normalization 후 여기서 명시적으로 체크
        const isNewSystemRequest = ci?.newSystemRequest?.requested === true;
        if (!isNewSystemRequest) {
          if (!normalizedCi.implantManufacturer)
            missing.push("임플란트 제조사");
          if (!normalizedCi.implantBrand) missing.push("임플란트 브랜드");
          if (!normalizedCi.implantFamily) missing.push("임플란트 패밀리");
          if (!normalizedCi.implantType) missing.push("임플란트 타입");
        }

        if (missing.length > 0) {
          const fileName = ci?.file?.originalName || `파일 ${idx + 1}`;
          return {
            skip: true,
            fileName,
            missingFields: missing,
          };
        }

        if (!isNewSystemRequest) {
          try {
            await assertOrderableImplantPresetOrThrow(normalizedCi);
          } catch (orderableError) {
            const fileName = ci?.file?.originalName || `파일 ${idx + 1}`;
            return {
              skip: true,
              fileName,
              missingFields: [
                orderableError?.message || "주문 불가 임플란트 조합",
              ],
            };
          }
        }

        const priceStart = Date.now();
        const computedPriceBase = await computePriceForRequest({
          requestorId: req.user._id,
          requestorOrgId: req.user?.businessAnchorId,
          clinicName,
          patientName,
          tooth,
          creditSettings,
          pricingBaseDate,
          skipExistingLookup: true,
          applySignupFreeTest: false,
        });
        let computedPrice = computedPriceBase;
        console.log("[createRequestsFromDraft] compute price", {
          t: Date.now() - startTime,
          idx,
          dt: Date.now() - priceStart,
        });

        const newSystemRequest = (() => {
          const nsr = ci?.newSystemRequest;
          if (nsr?.requested) {
            const manufacturer = String(nsr.manufacturer || "").trim();
            const brand = String(nsr.brand || "").trim();
            const family = String(nsr.family || "").trim();
            const message = String(
              nsr.message || "랩 아날로그 샘플 한 개를 요청드립니다",
            ).trim();
            return {
              requested: true,
              manufacturer,
              brand,
              family,
              message,
              free: true,
              tag: nsr.tag || "신규 임플란트 의뢰",
            };
          }
          return undefined;
        })();

        // practice 라우팅은 practice 태그에서만 승격한다.
        // 기존 의뢰자(기공소)->제조사 루트(newSystemRequest.manufacturer)는 그대로 유지한다.
        const nsrTag = String(ci?.newSystemRequest?.tag || "").trim();
        const practiceRouting = isPracticeRoutingTag(nsrTag)
          ? normalizePracticeRouting(ci?.practiceRouting)
          : undefined;

        if (newSystemRequest) {
          computedPrice = {
            ...(computedPrice || {}),
            amount: 0,
            supply: 0,
            vat: 0,
            free: true,
            discountReason: "신규 임플란트 의뢰(무상)",
            discountType: "free",
          };
        }

        // 유지홈(retentionGroove) — Draft → Request 승격 시 정규화 전달.
        // 현재 정책은 없음/있음 2단계이며, legacy shallow는 none으로 취급한다.
        const retentionGrooveValue = normalizeRetentionGroove(
          ci?.retentionGroove,
        );
        const requestorHexRotationValue = normalizeRequestorHexRotation(
          ci?.requestorHexRotation,
        );

        const caseInfosWithFile = ci?.file
          ? {
              ...normalizedCi,
              maxDiameter: ci.maxDiameter,
              connectionDiameter: ci.connectionDiameter,
              totalLength: ci.totalLength,
              taperAngle: ci.taperAngle,
              tiltAxisVector: ci.tiltAxisVector,
              frontPoint: ci.frontPoint,
              retentionGroove: retentionGrooveValue,
              requestorHexRotation: requestorHexRotationValue,
              finalHexRotation: requestorHexRotationValue,
              newSystemRequest,
              practiceRouting,
              file: {
                originalName: ci.file.originalName,
                fileType: ci.file.mimetype,
                fileSize: ci.file.size,
                filePath: undefined,
                s3Key: ci.file.s3Key,
              },
              ...(Array.isArray(ci.files) && ci.files.length > 0
                ? {
                    files: (() => {
                      const primaryKey = String(ci?.file?.s3Key || "").trim();
                      const seen = new Set(
                        primaryKey ? [primaryKey] : [],
                      );
                      return ci.files
                        .filter((f) => f && f.s3Key)
                        .filter((f) => {
                          const key = String(f.s3Key || "").trim();
                          if (!key || seen.has(key)) return false;
                          seen.add(key);
                          return true;
                        })
                        .map((f) => ({
                          originalName: f.originalName,
                          fileType: f.mimetype || f.fileType,
                          fileSize: f.size ?? f.fileSize,
                          filePath: undefined,
                          s3Key: f.s3Key,
                        }));
                    })(),
                  }
                : {}),
            }
          : {
              ...normalizedCi,
              maxDiameter: ci.maxDiameter,
              connectionDiameter: ci.connectionDiameter,
              totalLength: ci.totalLength,
              taperAngle: ci.taperAngle,
              tiltAxisVector: ci.tiltAxisVector,
              frontPoint: ci.frontPoint,
              retentionGroove: retentionGrooveValue,
              requestorHexRotation: requestorHexRotationValue,
              finalHexRotation: requestorHexRotationValue,
              newSystemRequest,
              practiceRouting,
            };

        return {
          idx,
          caseId: ci?._id ? String(ci._id) : String(idx),
          caseInfosWithFile,
          shippingMode,
          requestedShipDate,
          computedPrice,
          clinicName,
          patientName,
          tooth,
        };
      }),
    );

    for (const candidate of preparedCandidates) {
      if (!candidate) continue;
      if (candidate.skip) {
        missingFieldsByFile.push({
          fileName: candidate.fileName,
          missingFields: candidate.missingFields,
        });
        continue;
      }
      preparedCases.push(candidate);
    }

    if (preparedCases.length === 0) {
      return res.status(400).json({
        success: false,
        message: "필수 정보가 누락된 파일이 있습니다.",
        missingFiles: missingFieldsByFile,
        details: missingFieldsByFile
          .map(
            (item) => `${item.fileName}: ${item.missingFields.join(", ")} 필수`,
          )
          .join("\n"),
      });
    }

    const businessAnchorId = req.user?.businessAnchorId;
    if (
      !businessAnchorId ||
      !Types.ObjectId.isValid(String(businessAnchorId))
    ) {
      return res.status(403).json({
        success: false,
        message:
          "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
      });
    }

    console.log("[createRequestsFromDraft] normalize cases done", {
      t: Date.now() - startTime,
      preparedCount: preparedCases.length,
      missingCount: missingFieldsByFile.length,
    });
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const duplicates = [];
    const skipCaseIds = new Set();
    const autoSkippedDuplicateCaseIds = new Set();
    const existingByCombo = new Map();
    let remakeQuota = null;

    const isPracticeRoutingPayload =
      req.user?.role === "practice" &&
      preparedCases.length > 0 &&
      preparedCases.every((c) =>
        isPracticeRoutingTag(c?.caseInfosWithFile?.newSystemRequest?.tag),
      );

    if (enableDuplicateRequestCheck) {
      const keyTuplesRaw = preparedCases
        .map((item) => ({
          caseId: item.caseId,
          fileName: item.caseInfosWithFile?.file?.originalName || undefined,
          clinicName: String(item.clinicName || "").trim(),
          patientName: String(item.patientName || "").trim(),
          tooth: String(item.tooth || "").trim(),
        }))
        .filter((k) => k.clinicName && k.patientName && k.tooth);

      const tupleByKey = new Map();
      const duplicateInPayload = [];
      for (const item of keyTuplesRaw) {
        const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
        if (!tupleByKey.has(key)) {
          tupleByKey.set(key, item);
        } else {
          duplicateInPayload.push(item);
        }
      }

      if (duplicateInPayload.length > 0) {
        if (isPracticeRoutingPayload) {
          duplicateInPayload.forEach((d) => {
            const caseId = String(d.caseId || "").trim();
            if (!caseId) return;
            skipCaseIds.add(caseId);
            autoSkippedDuplicateCaseIds.add(caseId);
          });
        } else {
          return res.status(400).json({
            success: false,
            code: "DUPLICATE_IN_PAYLOAD",
            message:
              "제출한 의뢰 목록에 동일한 치과/환자/치아 조합이 중복되었습니다. 중복 항목을 제거하고 다시 제출해주세요.",
            data: {
              duplicates: duplicateInPayload.map((d) => ({
                caseId: d.caseId,
                clinicName: d.clinicName,
                patientName: d.patientName,
                tooth: d.tooth,
              })),
            },
          });
        }
      }

      const keyTuples = Array.from(tupleByKey.values());

      // practice 전송 SSOT:
      // - 같은 전송(payload) 내부 중복만 처리
      // - 과거 전송건(DB)과의 중복 비교는 하지 않는다.
      if (!isPracticeRoutingPayload && keyTuples.length > 0) {
        console.log("[createRequestsFromDraft] duplicate lookup start", {
          t: Date.now() - startTime,
          tuples: keyTuples.length,
        });
        const orConditions = keyTuples.map((k) => ({
          "caseInfos.clinicName": k.clinicName,
          "caseInfos.patientName": k.patientName,
          "caseInfos.tooth": k.tooth,
        }));

        const query = {
          $and: [
            requestFilter,
            { manufacturerStage: { $ne: "취소" } },
            { $or: orConditions },
          ],
        };

        const candidates = await Request.find(query)
          .select({
            _id: 1,
            requestId: 1,
            manufacturerStage: 1,
            createdAt: 1,
            price: 1,
            "caseInfos.clinicName": 1,
            "caseInfos.patientName": 1,
            "caseInfos.tooth": 1,
            "caseInfos.implantBrand": 1,
          })
          .sort({ createdAt: -1 })
          .lean();

        const latestByKey = new Map();
        for (const doc of candidates || []) {
          const ci = doc?.caseInfos || {};
          const key = `${String(ci.clinicName || "").trim()}|${String(
            ci.patientName || "",
          ).trim()}|${String(ci.tooth || "").trim()}`;
          if (!latestByKey.has(key)) {
            latestByKey.set(key, doc);
            existingByCombo.set(key, doc);
          }
        }

        for (const item of keyTuples) {
          const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
          const existing = latestByKey.get(key);
          if (!existing) continue;

          const normalizedStage = normalizeRequestStage(existing);
          const stageOrder = REQUEST_STAGE_ORDER[normalizedStage] ?? 0;

          duplicates.push({
            caseId: item.caseId,
            fileName: item.fileName,
            existingRequest: {
              _id: String(existing._id),
              requestId: String(existing.requestId || ""),
              manufacturerStage: String(existing.manufacturerStage || ""),
              price: existing.price || null,
              createdAt: existing.createdAt || null,
              caseInfos: {
                clinicName: String(existing?.caseInfos?.clinicName || ""),
                patientName: String(existing?.caseInfos?.patientName || ""),
                tooth: String(existing?.caseInfos?.tooth || ""),
              },
            },
            stageOrder,
            isCancelableStage: stageOrder <= 0,
          });
        }
        console.log("[createRequestsFromDraft] duplicate lookup done", {
          t: Date.now() - startTime,
          duplicates: duplicates.length,
        });
      }
      if (duplicates.length > 0 && !duplicateResolutions) {
        if (isPracticeRoutingPayload) {
          duplicates.forEach((d) => {
            const caseId = String(d.caseId || "").trim();
            if (!caseId) return;
            skipCaseIds.add(caseId);
            autoSkippedDuplicateCaseIds.add(caseId);
          });
        } else {
          remakeQuota = await getMonthlyRemakeQuota({
            scopeFilter: requestFilter,
          });
          const first = duplicates[0];
          const st = String(first?.existingRequest?.manufacturerStage || "");
          const mode = st === "추적관리" ? "tracking" : "active";
          return res.status(409).json({
            success: false,
            code: "DUPLICATE_REQUEST",
            message:
              st === "추적관리"
                ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 재의뢰(리메이크)로 접수할까요?"
                : "동일한 정보의 의뢰가 이미 진행 중입니다. 중복 의뢰 처리 방법을 선택해주세요.",
            data: {
              mode,
              duplicates,
              remakeQuota,
            },
          });
        }
      }
    }

    const resolutionsByCaseId = new Map();

    if (duplicates.length > 0 && duplicateResolutions) {
      const duplicatesByCaseId = new Map(
        duplicates.map((d) => [String(d.caseId || ""), d]),
      );
      const duplicatesByExistingRequestId = new Map(
        duplicates.map((d) => [String(d?.existingRequest?._id || ""), d]),
      );

      for (const r of duplicateResolutions) {
        const strategy = String(r.strategy || "").trim();
        if (!strategy) continue;
        if (!["skip", "replace", "remake"].includes(strategy)) {
          return res.status(400).json({
            success: false,
            message: "유효하지 않은 duplicateResolutions.strategy 입니다.",
          });
        }

        const rawCaseId = String(r.caseId || "").trim();
        const rawExistingRequestId = String(r.existingRequestId || "").trim();
        const matchedDuplicate =
          duplicatesByCaseId.get(rawCaseId) ||
          duplicatesByExistingRequestId.get(rawExistingRequestId);
        const resolvedCaseId = String(
          matchedDuplicate?.caseId || rawCaseId || "",
        ).trim();

        if (!resolvedCaseId) continue;

        if (strategy === "skip") {
          skipCaseIds.add(resolvedCaseId);
          continue;
        }

        resolutionsByCaseId.set(resolvedCaseId, {
          strategy,
          existingRequestId: rawExistingRequestId,
        });
      }

      const unresolved = duplicates.filter(
        (d) =>
          !resolutionsByCaseId.has(String(d.caseId || "")) &&
          !skipCaseIds.has(String(d.caseId || "")),
      );
      if (unresolved.length > 0) {
        console.log(
          `[Creation] Unresolved duplicates found: ${unresolved.length} cases`,
        );
        unresolved.forEach((d, idx) => {
          console.log(
            `  #${idx}: CaseId=${d.caseId}, Patient=${d.patientName}, ExistingStage=${d.existingRequest?.manufacturerStage}`,
          );
        });

        remakeQuota =
          remakeQuota ||
          (await getMonthlyRemakeQuota({
            scopeFilter: requestFilter,
          }));

        const firstUnresolved = unresolved[0];
        const st = String(
          firstUnresolved?.existingRequest?.manufacturerStage || "",
        );
        const mode = st === "추적관리" ? "tracking" : "active";
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_REQUEST",
          message:
            st === "추적관리"
              ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 중복 의뢰 처리 방법을 선택해주세요."
              : "동일한 정보의 의뢰가 이미 진행 중입니다. 중복 의뢰 처리 방법을 선택해주세요.",
          data: {
            mode,
            duplicates: unresolved,
            remakeQuota,
          },
        });
      }

      for (const [caseId, r] of resolutionsByCaseId.entries()) {
        const dup = duplicatesByCaseId.get(String(caseId));
        if (!dup) continue;

        const strategy = String(r?.strategy || "");
        if (strategy === "skip") continue;

        const expectedExistingId = String(dup?.existingRequest?._id || "");
        if (
          !r?.existingRequestId ||
          !Types.ObjectId.isValid(r.existingRequestId)
        ) {
          return res.status(400).json({
            success: false,
            message: "유효한 existingRequestId가 필요합니다.",
          });
        }
        if (
          expectedExistingId &&
          String(r.existingRequestId) !== expectedExistingId
        ) {
          return res.status(400).json({
            success: false,
            message: "중복 의뢰(existingRequestId) 정보가 일치하지 않습니다.",
          });
        }

        if (strategy === "replace") {
          const stageOrder = Number(dup?.stageOrder ?? 0);
          if (stageOrder > 0) {
            return res.status(400).json({
              success: false,
              message:
                "준비 단계가 아닌 기존 의뢰는 취소할 수 없습니다. 기존 의뢰를 유지하고 재의뢰로 진행해주세요.",
            });
          }
        }
      }
    }

    const preparedCasesForCreate = preparedCases.filter(
      (c) => !skipCaseIds.has(String(c.caseId)),
    );

    const isPracticeRoutingSubmission =
      req.user?.role === "practice" &&
      preparedCasesForCreate.length > 0 &&
      preparedCasesForCreate.every((c) =>
        isPracticeRoutingTag(c?.caseInfosWithFile?.newSystemRequest?.tag),
      );

    if (preparedCasesForCreate.length === 0) {
      return res.status(200).json({
        success: true,
        message: isPracticeRoutingPayload
          ? "중복된 항목을 제외한 신규 의뢰가 없어 전송하지 않았습니다."
          : "모든 중복 건이 기존 유지로 선택되어 신규 의뢰를 생성하지 않았습니다.",
        data: [],
        ...(autoSkippedDuplicateCaseIds.size > 0 && {
          skippedDuplicateCount: autoSkippedDuplicateCaseIds.size,
        }),
      });
    }

    // 정책: 기존 의뢰 취소 후 재의뢰(replace)는 리메이크 무료 카운트에 포함하지 않는다.
    // 따라서 replace 건은 일반 신규 의뢰 가격 규칙(forceNewOrderPricing)으로 재산정한다.
    if (resolutionsByCaseId.size > 0) {
      const replaceCaseIds = new Set(
        Array.from(resolutionsByCaseId.entries())
          .filter(([, r]) => String(r?.strategy || "") === "replace")
          .map(([caseId]) => String(caseId)),
      );

      if (replaceCaseIds.size > 0) {
        await Promise.all(
          preparedCasesForCreate.map(async (item) => {
            if (!replaceCaseIds.has(String(item.caseId))) return;
            item.computedPrice = await computePriceForRequest({
              requestorId: req.user._id,
              requestorOrgId: req.user?.businessAnchorId,
              clinicName: item.clinicName,
              patientName: item.patientName,
              tooth: item.tooth,
              forceNewOrderPricing: true,
              creditSettings,
              pricingBaseDate,
              applySignupFreeTest: false,
            });
          }),
        );
      }
    }

    if (existingByCombo.size > 0) {
      const remakeNowYmd = toKstYmd(new Date()) || getTodayYmdInKst();
      const remakeCutoff = new Date(`${remakeNowYmd}T00:00:00+09:00`);
      remakeCutoff.setDate(remakeCutoff.getDate() - 90);
      const replaceCaseIdsForPrice = new Set(
        Array.from(resolutionsByCaseId.entries())
          .filter(([, r]) => String(r?.strategy || "") === "replace")
          .map(([caseId]) => String(caseId)),
      );
      await Promise.all(
        preparedCasesForCreate.map(async (item) => {
          if (replaceCaseIdsForPrice.has(String(item.caseId))) return;
          const key = `${item.clinicName}|${item.patientName}|${item.tooth}`;
          const existing = existingByCombo.get(key);
          if (!existing) return;
          const createdAt = existing.createdAt
            ? new Date(existing.createdAt)
            : null;
          if (
            !createdAt ||
            Number.isNaN(createdAt.getTime()) ||
            createdAt < remakeCutoff
          ) {
            return;
          }
          if (!String(existing?.caseInfos?.implantBrand || "").trim()) return;
          item.computedPrice = await computePriceForRequest({
            requestorId: req.user._id,
            requestorOrgId: req.user?.businessAnchorId,
            clinicName: item.clinicName,
            patientName: item.patientName,
            tooth: item.tooth,
            creditSettings,
            pricingBaseDate,
            applySignupFreeTest: false,
          });
        }),
      );
    }

    // 의뢰자 CA 가입 무료 테스트(첫 2건): 배치 형제는 DB에 없어 쿼터를 직렬 배정.
    {
      const signupQuota = await getSignupFreeTestQuota({
        requestorOrgId: req.user?.businessAnchorId,
      });
      if (signupQuota.eligible && signupQuota.remaining > 0) {
        applySignupFreeTestPricingToBatch(preparedCasesForCreate, {
          remaining: signupQuota.remaining,
          used: signupQuota.used,
          baseUnitPrice: Math.max(
            0,
            Math.round(
              Number(
                preparedCasesForCreate.find(
                  (row) => Number(row?.computedPrice?.baseAmount) > 0,
                )?.computedPrice?.baseAmount,
              ) || 0,
            ),
          ),
        });
      }
    }

    // shippingOrg / creditSettings / manufacturerLeadTimes는 draft 로드와 병렬 prefetch
    const requestedAtForPrefetch = new Date();
    const createdYmd = toKstYmd(requestedAtForPrefetch) || getTodayYmdInKst();
    const shippingOrgId = String(businessAnchorId || shippingOrgIdEarly || "");
    const shippingFeePerBox = 3500;
    const expressFeePerRequest = Math.max(
      0,
      Number(creditSettings?.expressFee ?? 2000) || 2000,
    );
    const designFeePerTooth = Math.max(
      0,
      Number(creditSettings?.designFee ?? 5000) || 5000,
    );
    const weeklyBatchDays = Array.isArray(
      shippingOrg?.shippingPolicy?.weeklyBatchDays,
    )
      ? shippingOrg.shippingPolicy.weeklyBatchDays
      : [];
    const calculateSchedule = createProductionScheduleMemo();

    // 신속 ETA가 묶음과 같거나 늦으면 express → normal 강등 (스테일 클라 대비)
    await Promise.all(
      preparedCasesForCreate.map(async (item) => {
        if ((item?.shippingMode || "normal") !== "express") return;
        const maxDiameter =
          item?.caseInfosWithFile?.maxDiameter ??
          item?.caseInfos?.maxDiameter ??
          null;
        item.shippingMode = await resolveSelectableShippingMode({
          shippingMode: "express",
          requestedAt: requestedAtForPrefetch,
          weeklyBatchDays,
          maxDiameter,
          productMode:
            item?.caseInfosWithFile?.productMode ??
            item?.caseInfos?.productMode ??
            null,
          manufacturerLeadTimes,
          calculateSchedule,
        });
      }),
    );

    // 가공+디자인(어벗 배수) 합계. 신속비: 생산=건당, 디자인+생산=어벗 수.
    const totalSpendSupply = isPracticeRoutingSubmission
      ? 0
      : preparedCasesForCreate.reduce((acc, item) => {
          const n = resolveMachiningSpendAmount({
            price: item?.computedPrice,
            caseInfos: item?.caseInfosWithFile || item?.caseInfos || {},
            designFeePerTooth,
          });
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);
    const totalExpressFee = isPracticeRoutingSubmission
      ? 0
      : preparedCasesForCreate.reduce((acc, item) => {
          if (isSignupFreeTestPriceRule(item?.computedPrice?.rule)) return acc;
          if ((item.shippingMode || "normal") !== "express") return acc;
          const ci = item?.caseInfosWithFile || item?.caseInfos || {};
          const mode = String(ci?.productMode || "").trim();
          const qty =
            mode === "design_custom_abutment"
              ? Math.max(0, countDesignAbutmentQty(ci))
              : 1;
          return acc + qty * expressFeePerRequest;
        }, 0);
    const expressCount = preparedCasesForCreate.filter(
      (item) =>
        (item.shippingMode || "normal") === "express" &&
        !isSignupFreeTestPriceRule(item?.computedPrice?.rule),
    ).length;
    const requiredMachiningFee = totalSpendSupply + totalExpressFee;
    const requestorAnodizingEnabled =
      typeof requestorSettingsDoc?.requestSettings?.anodizingEnabled ===
      "boolean"
        ? requestorSettingsDoc.requestSettings.anodizingEnabled
        : typeof shippingOrg?.requestSettings?.anodizingEnabled === "boolean"
          ? shippingOrg.requestSettings.anodizingEnabled
          : true;
    const requestorDefaultHexRotation = normalizeRequestorHexRotation(
      shippingOrg?.requestSettings?.defaultRequestorHexRotation,
      "STL모델대로",
    );
    // 제조사 헥스 기본값 SSOT: 개인(User) → BusinessAnchor
    const requestorDefaultManufacturerHexRotation =
      normalizeManufacturerHexRotationModeOrNull(
        requestorSettingsDoc?.requestSettings?.defaultManufacturerHexRotation,
      ) ||
      normalizeManufacturerHexRotationModeOrNull(
        shippingOrg?.requestSettings?.defaultManufacturerHexRotation,
      );
    // 관리자 헥스 확인 확정값: User → BusinessAnchor
    const requestorAdminVerifiedHex =
      normalizeHexVerificationResultHex(
        requestorSettingsDoc?.requestSettings?.hexVerificationResultHex,
      ) ||
      normalizeHexVerificationResultHex(
        shippingOrg?.requestSettings?.hexVerificationResultHex,
      );
    const requestorExoCadVersion =
      normalizeExoCadVersion(
        requestorSettingsDoc?.requestSettings?.exoCadVersion,
      ) ||
      normalizeExoCadVersion(shippingOrg?.requestSettings?.exoCadVersion);
    const shipDate = createdYmd;
    const boxCount = 1;
    const allSignupFreeTest =
      preparedCasesForCreate.length > 0 &&
      preparedCasesForCreate.every((item) =>
        isSignupFreeTestPriceRule(item?.computedPrice?.rule),
      );
    const totalShippingFee =
      isPracticeRoutingSubmission || allSignupFreeTest
        ? 0
        : boxCount * shippingFeePerBox;
    console.log("[createRequestsFromDraft] pre-fetch done", {
      t: Date.now() - startTime,
      shippingFeePerBox,
      expressFeePerRequest,
      expressCount,
      totalExpressFee,
      weeklyBatchDays,
      shipDate,
      isPracticeRoutingSubmission,
      totalShippingFee,
    });

    // 묶음 배송 요일 설정 체크 (transaction 외부로 이동)
    const hasNormalShipping = preparedCasesForCreate.some(
      (item) => (item.shippingMode || "normal") === "normal",
    );
    if (hasNormalShipping && weeklyBatchDays.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "묶음 배송 요일을 설정해주세요. 신규 의뢰 페이지의 묶음 배송 섹션에서 요일을 선택 후 다시 시도하세요.",
      });
    }

    // 크레딧 보류는 201 응답 이후. 부족분은 생성 전에 막아 402 UX 유지.
    let creditBalanceForHold = null;
    if (!isPracticeRoutingSubmission && preparedCasesForCreate.length > 0) {
      creditBalanceForHold = await getBusinessCreditBalanceBreakdown({
        businessAnchorId,
      });
      const {
        balance,
        spendableBalance,
        paidCredit,
        freeRequestCredit,
        freeShippingCredit,
        settlementCredit,
      } = creditBalanceForHold;
      console.log("[createRequestsFromDraft] Credit balance check", {
        t: Date.now() - startTime,
        balance,
        spendableBalance,
        paidCredit,
        freeRequestCredit,
        freeShippingCredit,
        settlementCredit,
        requiredMachiningFee,
        totalSpendSupply,
        totalExpressFee,
        expressCount,
      });
      console.log("[createRequestsFromDraft] Shipping fee calculation", {
        t: Date.now() - startTime,
        boxCount,
        shippingFeePerBox,
        totalShippingFee,
      });

      const freeCredit = freeRequestCredit + freeShippingCredit;
      const totalAvailable = Number(
        spendableBalance ??
          paidCredit + freeCredit + Number(settlementCredit || 0),
      );
      let remaining = totalAvailable;
      const allocatedMachining = Math.min(remaining, requiredMachiningFee);
      remaining -= allocatedMachining;
      const allocatedShipping = Math.min(remaining, totalShippingFee);
      const availableForMachining = totalAvailable;
      const availableForShipping = Math.max(
        0,
        totalAvailable - allocatedMachining,
      );
      const machiningShortfall =
        requiredMachiningFee > allocatedMachining
          ? requiredMachiningFee - allocatedMachining
          : 0;
      const shippingShortfall =
        totalShippingFee > allocatedShipping
          ? totalShippingFee - allocatedShipping
          : 0;

      if (machiningShortfall > 0 || shippingShortfall > 0) {
        let message = "";
        const details = [];
        const requestCount = preparedCasesForCreate.length;
        if (machiningShortfall > 0 && shippingShortfall > 0) {
          message = "의뢰비와 배송비 크레딧이 모두 부족합니다.";
          details.push(
            `의뢰비 필요: ${requiredMachiningFee.toLocaleString()}원 (${requestCount}건 합계${
              totalExpressFee > 0
                ? `, 신속 ${expressCount}건 +${totalExpressFee.toLocaleString()}원`
                : ""
            }, 보유: ${availableForMachining.toLocaleString()}원)`,
          );
          details.push(
            `배송비 필요: ${totalShippingFee.toLocaleString()}원 (보유: ${availableForShipping.toLocaleString()}원)`,
          );
        } else if (machiningShortfall > 0) {
          message = "의뢰비 크레딧이 부족합니다.";
          details.push(
            `필요: ${requiredMachiningFee.toLocaleString()}원 (${requestCount}건 합계${
              totalExpressFee > 0
                ? `, 신속 ${expressCount}건 +${totalExpressFee.toLocaleString()}원`
                : ""
            }), 보유: ${availableForMachining.toLocaleString()}원`,
          );
        } else {
          message = "배송비 크레딧이 부족합니다.";
          details.push(
            `필요: ${totalShippingFee.toLocaleString()}원, 보유: ${availableForShipping.toLocaleString()}원`,
          );
        }
        message +=
          " " +
          details.join(", ") +
          ". 크레딧을 충전한 뒤 다시 시도해주세요.";
        return res.status(402).json({
          success: false,
          message,
          data: {
            machiningFee: {
              required: requiredMachiningFee,
              available: availableForMachining,
              shortfall: machiningShortfall,
              baseAmount: totalSpendSupply,
              expressFee: totalExpressFee,
              expressCount,
            },
            shippingFee: {
              required: totalShippingFee,
              available: availableForShipping,
              shortfall: shippingShortfall,
              boxCount,
              feePerBox: shippingFeePerBox,
            },
            reason: "insufficient_credit",
            requestCount,
          },
        });
      }
    }

    const requestIds = generateRequestIdBatch(preparedCasesForCreate.length);
    let session = null;
    let deferredDashboardRefreshAnchorId = null;
    let deferredHexSampleContext = null;
    let deferredCreditHoldContext = null;
    try {
      const [, startedSession] = await Promise.all([
        Promise.all(
          preparedCasesForCreate.map(async (item) => {
            const shippingMode = item.shippingMode || "normal";
            item.productionSchedule = await calculateSchedule({
              shippingMode,
              maxDiameter: item.caseInfosWithFile?.maxDiameter,
              requestedAt: requestedAtForPrefetch,
              weeklyBatchDays:
                shippingMode === "normal" ? weeklyBatchDays : [],
              productMode: item.caseInfosWithFile?.productMode ?? null,
              manufacturerLeadTimes,
            });
          }),
        ),
        mongoose.startSession(),
      ]);
      session = startedSession;
      console.log("[createRequestsFromDraft] transaction start", {
        t: Date.now() - startTime,
        createCount: preparedCasesForCreate.length,
      });
      await session.withTransaction(async () => {
        if (duplicates.length > 0 && duplicateResolutions) {
          const dupsByCaseId = new Map(
            duplicates.map((d) => [String(d.caseId || ""), d]),
          );

          for (const [caseId, r] of resolutionsByCaseId.entries()) {
            const strategy = String(r?.strategy || "").trim();
            if (strategy !== "replace") continue;

            const dup = dupsByCaseId.get(String(caseId));
            const existingRequestId = String(r?.existingRequestId || "").trim();
            if (!dup || !existingRequestId) continue;

            const existingDoc = await Request.findById(existingRequestId)
              .populate("requestor", "_id businessAnchorId")
              .session(session);
            if (!existingDoc) {
              const err = new Error("기존 의뢰를 찾을 수 없습니다.");
              err.statusCode = 404;
              throw err;
            }
            if (!(await canAccessRequestAsRequestor(req, existingDoc))) {
              const err = new Error("기존 의뢰에 접근 권한이 없습니다.");
              err.statusCode = 403;
              throw err;
            }

            const normalizedStage = normalizeRequestStage(existingDoc);
            const currentStageOrder = REQUEST_STAGE_ORDER[normalizedStage] ?? 0;
            if (currentStageOrder > 0) {
              const err = new Error(
                "준비 단계가 아닌 기존 의뢰는 취소할 수 없습니다. 기존 의뢰를 유지하고 재의뢰로 진행해주세요.",
              );
              err.statusCode = 400;
              throw err;
            }

            if (normalizedStage !== "취소") {
              existingDoc.manufacturerStage = "취소";
              await existingDoc.save({ session });
            }

            // 크레딧은 가공 진입(CAM 승인) 시 차감되므로 준비 단계 취소에서는 환불할 것이 없음
            // Replace는 stageOrder === 0 (준비)에서만 허용되므로 환불 처리 불필요
          }

          for (const [caseId, r] of resolutionsByCaseId.entries()) {
            const strategy = String(r?.strategy || "").trim();
            if (strategy !== "remake") continue;
            const existingRequestId = String(r?.existingRequestId || "").trim();
            if (!existingRequestId) continue;

            const existingDoc = await Request.findById(existingRequestId)
              .select({
                _id: 1,
                requestor: 1,
                businessAnchorId: 1,
                manufacturerStage: 1,
                "caseInfos.reviewByStage.shipping.status": 1,
              })
              .populate("requestor", "_id businessAnchorId")
              .session(session);
            if (!existingDoc) {
              const err = new Error("기존 의뢰를 찾을 수 없습니다.");
              err.statusCode = 404;
              throw err;
            }
            if (!(await canAccessRequestAsRequestor(req, existingDoc))) {
              const err = new Error("기존 의뢰에 접근 권한이 없습니다.");
              err.statusCode = 403;
              throw err;
            }
            // 진행 중인 의뢰도 재의뢰(리메이크)로 신규 접수 가능하도록 허용
          }
        }

        const dupsByCaseId = new Map(
          duplicates.map((d) => [String(d.caseId || ""), d]),
        );

        const requestDocs = [];

        for (const [index, item] of preparedCasesForCreate.entries()) {
          const shippingMode = item.shippingMode || "normal";
          const requestedAt = requestedAtForPrefetch;
          const requestedShipDate = item.requestedShipDate || undefined;
          const requestId = requestIds[index];

          const resolvedDesignSoftware = normalizeDesignSoftware(
            item.caseInfosWithFile?.designSoftware,
          );
          if (!resolvedDesignSoftware) {
            const err = new Error(
              "케이스별 디자인 소프트웨어가 비어 있습니다. 파일 카드에서 디자인 소프트웨어를 먼저 설정해주세요.",
            );
            err.statusCode = 400;
            throw err;
          }

          const resolvedExoCadVersion =
            normalizeExoCadVersion(item.caseInfosWithFile?.exoCadVersion) ||
            (resolvedDesignSoftware === "ExoCAD"
              ? requestorExoCadVersion
              : null);

          const implantManufacturer = String(
            item.caseInfosWithFile?.implantManufacturer ||
              item.caseInfos?.implantManufacturer ||
              "",
          ).trim();

          const userRs = requestorSettingsDoc?.requestSettings || null;
          const anchorRs = shippingOrg?.requestSettings || null;

          // 임플란트 제조사별 확정/applyHex30 시드 (ExoCAD 3.0 이하)
          const hexVerificationPending = isHexVerificationPending({
            designSoftware: resolvedDesignSoftware,
            exoCadVersion: resolvedExoCadVersion,
            implantManufacturer,
            userRequestSettings: userRs,
            anchorRequestSettings: anchorRs,
            adminVerifiedHex: requestorAdminVerifiedHex,
          });

          const resolvedManufacturerHexRotation =
            resolveExoCadManufacturerHexRotation({
              designSoftware: resolvedDesignSoftware,
              exoCadVersion: resolvedExoCadVersion,
              implantManufacturer,
              userRequestSettings: userRs,
              anchorRequestSettings: anchorRs,
              manufacturerDefault: requestorDefaultManufacturerHexRotation,
              adminVerifiedHex: requestorAdminVerifiedHex,
              hexVerificationPending,
            });

          const resolvedRequestorHexRotation =
            resolvedManufacturerHexRotation ||
            resolveHexRotationByDesignSoftware(
              resolvedDesignSoftware,
              resolvedExoCadVersion,
            );

          const resolvedFinalHexRotation = resolveFinalHexRotationValue({
            manufacturerHexRotation: resolvedManufacturerHexRotation,
          });
          const hexRotationMode = resolvedManufacturerHexRotation;

          const quotedPrice = isPracticeRoutingSubmission
            ? item.computedPrice
            : resolveQuotedPriceWithExtras({
                price: item.computedPrice,
                caseInfos: item.caseInfosWithFile || item.caseInfos || {},
                shippingMode,
                expressFee: expressFeePerRequest,
                designFeePerTooth,
              });

          const newRequest = {
            requestId,
            requestor: req.user._id,
            businessAnchorId:
              req.user?.role === "requestor" && req.user?.businessAnchorId
                ? req.user.businessAnchorId
                : null,
            price: quotedPrice,
            shippingMode,
            requestedShipDate,
            caseInfos: {
              ...(item.caseInfosWithFile || {}),
              designSoftware: resolvedDesignSoftware || undefined,
              exoCadVersion: resolvedExoCadVersion || undefined,
              anodizingEnabled:
                typeof item.caseInfosWithFile?.anodizingEnabled === "boolean"
                  ? item.caseInfosWithFile.anodizingEnabled
                  : requestorAnodizingEnabled,
              requestorHexRotation: resolvedRequestorHexRotation,
              finalHexRotation: resolvedFinalHexRotation,
              hexRotation: {
                mode: hexRotationMode,
              },
            },
            ...(resolvedManufacturerHexRotation
              ? {
                  rnd: {
                    manufacturerHexRotation: resolvedManufacturerHexRotation,
                  },
                }
              : {}),
            manufacturerStage: "준비",
          };

          // 기공의뢰 선결제·거래처 생산차감 메타 (클라이언트/기공소 연계)
          const partnerBillingBody =
            (item?.partnerBilling && typeof item.partnerBilling === "object"
              ? item.partnerBilling
              : null) ||
            (req.body?.partnerBilling &&
            typeof req.body.partnerBilling === "object"
              ? req.body.partnerBilling
              : null);
          if (partnerBillingBody) {
            newRequest.partnerBilling = {
              practicePrepaidAbutment: Boolean(
                partnerBillingBody.practicePrepaidAbutment,
              ),
              isTradingPartner: Boolean(partnerBillingBody.isTradingPartner),
              labTradingPartnerId:
                partnerBillingBody.labTradingPartnerId || null,
              relatedPracticeTransferId:
                partnerBillingBody.relatedPracticeTransferId || null,
              billingOwnerAnchorId:
                partnerBillingBody.billingOwnerAnchorId ||
                (Boolean(partnerBillingBody.isTradingPartner)
                  ? req.user?.businessAnchorId || null
                  : null),
            };
          }

          newRequest.originalShipping = {
            mode: shippingMode,
            requestedAt,
          };

          newRequest.finalShipping = {
            mode: shippingMode,
            updatedAt: requestedAt,
          };

          // weeklyBatchDays already fetched in pre-fetch phase (same org as businessAnchorId)
          const requestorWeeklyBatchDays = weeklyBatchDays;

          if (
            shippingMode === "normal" &&
            requestorWeeklyBatchDays.length === 0
          ) {
            const batchDayErr2 = new Error(
              "묶음 배송 요일을 설정해주세요. 설정 > 배송에서 요일을 선택 후 다시 시도하세요.",
            );
            batchDayErr2.statusCode = 400;
            throw batchDayErr2;
          }

          const productionSchedule =
            item.productionSchedule ||
            (await calculateInitialProductionSchedule({
              shippingMode,
              maxDiameter: item.caseInfosWithFile?.maxDiameter,
              requestedAt,
              weeklyBatchDays:
                shippingMode === "normal" ? requestorWeeklyBatchDays : [],
              productMode: item.caseInfosWithFile?.productMode ?? null,
              manufacturerLeadTimes,
            }));
          newRequest.productionSchedule = productionSchedule;

          const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
          const pickupYmdRaw = productionSchedule?.scheduledShipPickup
            ? toKstYmd(productionSchedule.scheduledShipPickup)
            : null;
          if (pickupYmdRaw) {
            newRequest.timeline = newRequest.timeline || {};
            newRequest.timeline.originalEstimatedShipYmd = pickupYmdRaw;
            newRequest.timeline.nextEstimatedShipYmd = pickupYmdRaw;
            newRequest.timeline.estimatedShipYmd = pickupYmdRaw;
          } else {
            const leadTimes = manufacturerLeadTimes || {};

            const maxD = item.caseInfosWithFile?.maxDiameter;
            const d = typeof maxD === "number" && !isNaN(maxD) ? maxD : 8;
            let diameterKey = "d8";
            if (d <= 6) diameterKey = "d6";
            else if (d <= 8) diameterKey = "d8";
            else if (d <= 10) diameterKey = "d10";
            else diameterKey = "d12";

            const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
            const resolvedLeadDays = resolveLeadDaysWithSameDayCutoff({
              leadDays,
              requestedAt,
              shippingMode,
            });

            const estimatedShipYmd = await addKoreanBusinessDays({
              startYmd: createdYmd,
              days:
                shippingMode === "express"
                  ? resolvedLeadDays
                  : Math.max(1, resolvedLeadDays),
            });
            newRequest.timeline = newRequest.timeline || {};
            newRequest.timeline.originalEstimatedShipYmd = estimatedShipYmd;
            newRequest.timeline.nextEstimatedShipYmd = estimatedShipYmd;
            newRequest.timeline.estimatedShipYmd = estimatedShipYmd;
          }

          if (duplicateResolutions) {
            const r = resolutionsByCaseId.get(String(item.caseId));
            if (String(r?.strategy || "") === "remake") {
              const dup = dupsByCaseId.get(String(item.caseId));
              const oldRequestId = dup?.existingRequest?.requestId;
              if (oldRequestId) {
                newRequest.referenceIds = Array.from(
                  new Set([
                    ...(newRequest.referenceIds || []),
                    String(oldRequestId),
                  ]),
                );
              }
            }
          }

          if (item.caseInfosWithFile.file?.s3Key) {
            const s3Key = item.caseInfosWithFile.file.s3Key;
            const bgFileName = buildStandardStlFileName({
              requestId,
              clinicName: item.clinicName,
              patientName: item.patientName,
              tooth: item.tooth,
              originalFileName: item.caseInfosWithFile.file.originalName,
            });

            if (newRequest.caseInfos?.file) {
              newRequest.caseInfos.file.filePath = bgFileName;
            }

            // [정책] uploadS3ToRhinoServer 제거 — rhino-server가 process-file 트리거 시 S3에서 직접 다운로드
            // 실제 트리거는 트랜잭션 커밋 이후에 일괄 호출 (아래 createdRequests 루프 참고).
          }

          if (process.env.NODE_ENV !== "production") {
            console.info("[createRequestsFromDraft][hexRotation]", {
              requestId,
              draftCaseId: item.caseId,
              businessAnchorId: shippingOrgId || null,
              defaultRequestorHexRotation: requestorDefaultHexRotation,
              resolvedDesignSoftware: resolvedDesignSoftware || null,
              defaultManufacturerHexRotation:
                requestorDefaultManufacturerHexRotation,
              draftRequestorHexRotation: String(
                item.caseInfosWithFile?.requestorHexRotation || "",
              ),
              savedRequestorHexRotation: String(
                newRequest?.caseInfos?.requestorHexRotation || "",
              ),
              resolvedManufacturerHexRotation,
              savedManufacturerHexRotation: String(
                newRequest?.rnd?.manufacturerHexRotation || "",
              ),
              savedFinalHexRotation: String(
                newRequest?.caseInfos?.finalHexRotation || "",
              ),
            });
          }

          requestDocs.push(newRequest);
        }

        await ensureLotNumbersOnReadyEnter(requestDocs, session);

        const insertedRequests = await Request.insertMany(requestDocs, {
          session,
        });
        insertedRequests.forEach((doc) => createdRequests.push(doc));
      });
      console.log("[createRequestsFromDraft] transaction done", {
        t: Date.now() - startTime,
        created: createdRequests.length,
      });

      if (!isPracticeRoutingSubmission && createdRequests.length > 0) {
        deferredCreditHoldContext = {
          requests: [...createdRequests],
          actorUserId: req.user?._id || null,
          shippingFee: shippingFeePerBox,
          seedBalance: creditBalanceForHold,
          devopsAnchorId: devopsAnchorIdPrefetch,
        };
      }

      // 헥스 확인용 복사샘플·credit hold·대시보드 refresh는 201 finish 이후.
      // LotCounter/추가 Request 저장이 제출 트랜잭션과 겹치면 write conflict 재시도가 나므로
      // 트랜잭션 밖·응답 뒤로 둔다.
      const hexSampleSourceRequests =
        !isPracticeRoutingSubmission && createdRequests.length > 0
          ? [...createdRequests]
          : null;
      const hexSampleUserId = req.user?._id || null;
      const hexSampleBusinessAnchorId =
        shippingOrgId || req.user?.businessAnchorId || null;

      // [트리거] 트랜잭션 커밋 후 rhino-server에 fill hole 처리 시작을 알린다 (fire-and-forget).
      // 헥스 확인용 복사샘플은 라이노를 돌리지 않는다 — 원본 2-filled 완료 시 stlFile(+legacy camFile)을 복사한다.
      // 의뢰별로 STL이 있으면 각각 트리거. 실패해도 의뢰 생성은 그대로 성공 응답된다.
      try {
        const { triggerRhinoProcessFileForRequest } =
          await import("../rhino/rhino.controller.js");
        for (const doc of createdRequests) {
          if (doc?.caseInfos?.hexVerificationSample === true) continue;
          const filePath = doc?.caseInfos?.file?.filePath;
          if (!filePath) continue;
          triggerRhinoProcessFileForRequest({
            requestId: doc.requestId,
            filePath,
            fileName: filePath,
          });
        }
      } catch (e) {
        console.warn(
          "[createRequestsFromDraft] rhino trigger import/dispatch failed",
          e?.message || e,
        );
      }

      const createdAnchorId = String(
        createdRequests[0]?.businessAnchorId ||
          req.user?.businessAnchorId ||
          "",
      ).trim();
      deferredHexSampleContext = hexSampleSourceRequests
        ? {
            sourceRequests: hexSampleSourceRequests,
            userId: hexSampleUserId,
            businessAnchorId: hexSampleBusinessAnchorId,
            actorUserId: hexSampleUserId,
          }
        : null;
      if (createdAnchorId) {
        try {
          const { clearMyRequestsCache } = await import(
            "./common.requests.controller.js"
          );
          clearMyRequestsCache();
        } catch {
          // best-effort
        }
        // credit:balance-updated는 hold 성공 후 finish 핸들러에서 emit
        deferredDashboardRefreshAnchorId = createdAnchorId;
      } else {
        console.warn(
          "[createRequestsFromDraft] No businessAnchorId for dashboard refresh",
          {
            createdCount: createdRequests.length,
            userId: req.user?._id,
          },
        );
      }
    } catch (e) {
      const statusCode = Number(e?.statusCode || 0);
      if (statusCode === 402) {
        return res.status(402).json({
          success: false,
          message:
            e.message ||
            "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해주세요.",
          data: e.payload || null,
        });
      }
      if (statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({
          success: false,
          message: e.message || "요청 처리 중 오류가 발생했습니다.",
        });
      }
      throw e;
    } finally {
      if (session) {
        session.endSession();
      }
    }

    if (!isPracticeRoutingSubmission && createdRequests.length > 0) {
      const createdAnchorIdForEvent = String(
        createdRequests[0]?.businessAnchorId ||
          req.user?.businessAnchorId ||
          "",
      ).trim();
      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:count-update", {
        source: "requestor-new-request",
        action: "created",
        stage: "request",
        delta: createdRequests.length,
        requestCategory: "order",
        requestIds: createdRequests
          .map((row) => String(row?.requestId || "").trim())
          .filter(Boolean),
        requestMongoIds: createdRequests
          .map((row) => String(row?._id || "").trim())
          .filter(Boolean),
      });
      // request:stage-changed는 대시보드 스냅샷 refresh 이후에 emit
      // (finish 핸들러). 미리내면 헤더가 stale 0건을 캐시한다.

      const designQueueCreated = createdRequests.filter(
        (row) =>
          String(row?.caseInfos?.productMode || "").trim() ===
          "design_custom_abutment",
      );
      if (designQueueCreated.length > 0) {
        emitDesignClaimChanged({
          reason: "created",
          delta: designQueueCreated.length,
          requestIds: designQueueCreated
            .map((row) => String(row?.requestId || "").trim())
            .filter(Boolean),
          requestMongoIds: designQueueCreated
            .map((row) => String(row?._id || "").trim())
            .filter(Boolean),
        });
      }
    }

    if (isPracticeRoutingSubmission && createdRequests.length > 0) {
      // related files:
      // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
      // - web/frontend/src/shared/realtime/socket.ts
      // practice 제출 완료 시 최근 전송 내역 실시간 갱신 트리거
      emitAppEventToUser(req.user?._id, "practice:transfer-created", {
        source: "createRequestsFromDraft",
        requestIds: createdRequests
          .map((row) => String(row?.requestId || "").trim())
          .filter(Boolean),
        requestMongoIds: createdRequests
          .map((row) => String(row?._id || "").trim())
          .filter(Boolean),
        count: createdRequests.length,
      });
    }

    console.log("[createRequestsFromDraft] response", {
      t: Date.now() - startTime,
      created: createdRequests.length,
      isPracticeRoutingSubmission,
    });
    const warningParts = [];
    if (missingFieldsByFile.length > 0) {
      warningParts.push(
        `${missingFieldsByFile.length}개 파일은 필수 정보 누락으로 제외되었습니다.`,
      );
    }
    if (autoSkippedDuplicateCaseIds.size > 0) {
      warningParts.push(
        `${autoSkippedDuplicateCaseIds.size}개 파일은 중복 의뢰로 자동 제외되었습니다.`,
      );
    }

    const leanCreated = {
      count: createdRequests.length,
      requestIds: createdRequests
        .map((row) => String(row?.requestId || "").trim())
        .filter(Boolean),
      requestMongoIds: createdRequests
        .map((row) => String(row?._id || "").trim())
        .filter(Boolean),
    };

    if (
      deferredDashboardRefreshAnchorId ||
      deferredHexSampleContext ||
      deferredCreditHoldContext
    ) {
      const refreshAnchorId = deferredDashboardRefreshAnchorId;
      const refreshRequestIds = leanCreated.requestIds;
      const hexCtx = deferredHexSampleContext;
      const holdCtx = deferredCreditHoldContext;
      res.once("finish", () => {
        void (async () => {
          const requestIdsForRefresh = [...refreshRequestIds];
          let holdOk = true;

          if (holdCtx?.requests?.length) {
            const holdT0 = Date.now();
            try {
              await holdRequestCreditsOnSubmit({
                requests: holdCtx.requests,
                actorUserId: holdCtx.actorUserId,
                session: null,
                shippingFee: holdCtx.shippingFee,
                seedBalance: holdCtx.seedBalance,
                devopsAnchorId: holdCtx.devopsAnchorId,
              });
              console.log("[createRequestsFromDraft] credit hold done", {
                t: Date.now() - startTime,
                dt: Date.now() - holdT0,
                created: holdCtx.requests.length,
              });
              if (refreshAnchorId) {
                try {
                  const { emitCreditBalanceUpdatedToBusiness } = await import(
                    "../../utils/creditRealtime.js"
                  );
                  void emitCreditBalanceUpdatedToBusiness({
                    businessAnchorId: refreshAnchorId,
                    balanceDelta: 0,
                    reason: "request_submit_hold",
                    refId: holdCtx.requests[0]?._id || null,
                    forceEmit: true,
                  });
                } catch {
                  // best-effort
                }
              }
            } catch (holdErr) {
              holdOk = false;
              console.error(
                "[createRequestsFromDraft] credit hold failed after create",
                holdErr?.message || holdErr,
              );
              try {
                const ids = holdCtx.requests
                  .map((row) => row?._id)
                  .filter(Boolean);
                if (ids.length > 0) {
                  await Request.updateMany(
                    { _id: { $in: ids } },
                    {
                      $set: {
                        manufacturerStage: "취소",
                      },
                      $push: {
                        statusHistory: {
                          status: "취소",
                          note: "크레딧 보류 실패로 자동 취소",
                          updatedBy: holdCtx.actorUserId || null,
                          updatedAt: new Date(),
                        },
                      },
                    },
                  );
                  console.warn(
                    "[createRequestsFromDraft] cancelled requests after hold failure",
                    {
                      count: ids.length,
                      requestIds: holdCtx.requests.map((r) => r.requestId),
                    },
                  );
                }
              } catch (cancelErr) {
                console.error(
                  "[createRequestsFromDraft] cancel after hold failure failed",
                  cancelErr?.message || cancelErr,
                );
              }
            }
          }

          // hold 실패로 취소했으면 헥스 샘플·대시보드만 갱신(샘플은 스킵)
          if (holdOk && hexCtx?.sourceRequests?.length) {
            try {
              const verificationClones =
                await maybeCreateHexVerificationSampleForFirstOrder(hexCtx);
              for (const verificationClone of verificationClones || []) {
                const sampleRequestId = String(
                  verificationClone?.requestId || "",
                ).trim();
                if (sampleRequestId) requestIdsForRefresh.push(sampleRequestId);
                console.log(
                  "[createRequestsFromDraft] hex verification sample created",
                  {
                    sampleRequestId,
                    manufacturer:
                      verificationClone?.caseInfos
                        ?.hexVerificationSampleManufacturer ||
                      verificationClone?.caseInfos?.implantManufacturer ||
                      null,
                    referenceIds: verificationClone?.referenceIds || [],
                  },
                );
              }
            } catch (hexSampleErr) {
              console.warn(
                "[createRequestsFromDraft] hex verification sample failed",
                hexSampleErr?.message || hexSampleErr,
              );
            }
          }
          if (!refreshAnchorId) return;
          console.log("[createRequestsFromDraft] Triggering dashboard refresh", {
            businessAnchorId: refreshAnchorId,
            createdCount: requestIdsForRefresh.length,
            requestIds: requestIdsForRefresh,
            holdOk,
          });
          try {
            await triggerDashboardSummaryRefreshForAnchorId(
              refreshAnchorId,
              holdOk ? "request-created" : "request-hold-failed-cancel",
            );
          } catch (err) {
            console.error(
              "[createRequestsFromDraft] dashboard refresh error",
              err,
            );
          }
          // 스냅샷 갱신 후에야 헤더가 최신 건수를 읽도록 stage-changed emit
          emitAppEventToRoles(["requestor"], "request:stage-changed", {
            source: "createRequestsFromDraft",
            action: holdOk ? "created" : "hold-failed-cancel",
            fromStage: "",
            toStage: holdOk ? "준비" : "취소",
            businessAnchorId: refreshAnchorId,
            requestorBusinessAnchorId: refreshAnchorId,
            requestIds: requestIdsForRefresh,
            requestMongoIds: (holdCtx?.requests || [])
              .map((row) => String(row?._id || "").trim())
              .filter(Boolean),
            count: requestIdsForRefresh.length,
          });
        })();
      });
    }

    return res.status(201).json({
      success: true,
      message: `${createdRequests.length}건의 의뢰가 Draft에서 생성되었습니다.`,
      data: leanCreated,
      ...(warningParts.length > 0 && {
        warning: warningParts.join(" "),
      }),
      ...(missingFieldsByFile.length > 0 && {
        missingFiles: missingFieldsByFile,
      }),
      ...(autoSkippedDuplicateCaseIds.size > 0 && {
        skippedDuplicateCount: autoSkippedDuplicateCaseIds.size,
      }),
    });
  } catch (error) {
    console.error("Error in createRequestsFromDraft:", error);

    if (isDuplicateKeyError(error)) {
      const msg = String(error?.message || "");
      const isRequestIdDup = msg.includes("requestId");
      return res.status(409).json({
        success: false,
        code: isRequestIdDup ? "REQUEST_ID_CONFLICT" : "DUPLICATE_KEY",
        message: isRequestIdDup
          ? "의뢰 번호 생성이 충돌했습니다. 잠시 후 다시 시도해주세요."
          : "중복된 데이터로 인해 요청을 처리할 수 없습니다. 다시 시도해주세요.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Draft에서 의뢰 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
