import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import {
  normalizeCaseInfosImplantFields,
  ensureReviewByStageDefaults,
} from "./utils.js";
import {
  computePriceForRequest,
  canAccessRequestAsRequestor,
  buildRequestorOrgScopeFilter,
  addKoreanBusinessDays,
  normalizeKoreanBusinessDay,
  getTodayYmdInKst,
  toKstYmd,
  getRequestorOrgId,
  normalizeRequestStage,
  REQUEST_STAGE_ORDER,
} from "./utils.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "../../services/requestSnapshotTriggers.service.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "../../services/bulkShippingSnapshot.service.js";
import {
  buildStandardStlFileName,
  getBusinessCreditBalanceBreakdown,
  isDuplicateKeyError,
} from "./creation.helpers.controller.js";

const REQUEST_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const REQUEST_ID_SUFFIX_LEN = 8;
const REQUEST_ID_MAX_TRIES = 8;

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

const generateRequestIdBatch = async (count, session) => {
  const prefix = buildRequestIdPrefix();
  const requestIds = new Array(count).fill(null);
  let pending = Array.from({ length: count }, (_, idx) => idx);

  for (let attempt = 0; attempt < REQUEST_ID_MAX_TRIES; attempt += 1) {
    if (!pending.length) break;
    const candidates = pending.map(() => `${prefix}-${makeRequestSuffix()}`);
    const existing = await Request.find({ requestId: { $in: candidates } })
      .select({ requestId: 1 })
      .session(session)
      .lean();
    const existingSet = new Set(existing.map((doc) => doc.requestId));
    const nextPending = [];

    pending.forEach((idx, candidateIndex) => {
      const candidate = candidates[candidateIndex];
      if (existingSet.has(candidate) || requestIds.includes(candidate)) {
        nextPending.push(idx);
        return;
      }
      requestIds[idx] = candidate;
    });

    pending = nextPending;
  }

  if (pending.length) {
    throw new Error("requestId 생성에 실패했습니다.");
  }

  return requestIds;
};

/**
 * ===== 신규 의뢰 생성 표준 엔드포인트 (SSOT) =====
 * Draft 기반 워크플로우: 파일 업로드 → Draft 생성 → Draft 수정 → Request로 전환
 *
 * Draft를 Request로 전환 (다건 지원)
 * - 중복 체크, 크레딧 사전 체크, 트랜잭션 처리 포함
 * - 프론트엔드: useNewRequestSubmitV2.ts
 * - 참고: rules.md 섹션 4.3.2 "신규 의뢰 생성 엔드포인트 (SSOT)"
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
    const [draft, lockStatus] = await Promise.all([
      DraftRequest.findById(draftId).lean(),
      earlyOrgId && Types.ObjectId.isValid(earlyOrgId)
        ? checkCreditLock(earlyOrgId)
        : Promise.resolve({ isLocked: false }),
    ]);
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

    if (req.user?.role === "requestor") {
      if (!earlyOrgId || !Types.ObjectId.isValid(earlyOrgId)) {
        return res.status(403).json({
          success: false,
          message:
            "사업자 소속 정보가 필요합니다. 설정 > 사업자에서 소속을 먼저 확인해주세요.",
        });
      }
      if (lockStatus.isLocked) {
        return res.status(403).json({
          success: false,
          message: `크레딧 사용이 제한되었습니다. 사유: ${lockStatus.reason}`,
          lockedAt: lockStatus.lockedAt,
        });
      }
    }

    const draftCaseInfos = Array.isArray(draft.caseInfos)
      ? draft.caseInfos
      : [];

    let caseInfosArray = draftCaseInfos;
    if (Array.isArray(req.body.caseInfos) && req.body.caseInfos.length > 0) {
      const incoming = req.body.caseInfos;
      caseInfosArray = draftCaseInfos.map((ci, idx) => {
        const incomingCi = incoming[idx] || {};
        return {
          ...ci,
          ...incomingCi,
          file: ci.file,
          workType: (incomingCi.workType || ci.workType || "abutment").trim(),
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

        const shippingMode = "normal"; // Only bulk shipping supported
        const requestedShipDate = ci?.requestedShipDate || undefined;

        const missing = [];
        if (!clinicName) missing.push("치과이름");
        if (!patientName) missing.push("환자이름");

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

        const priceStart = Date.now();
        let computedPrice = await computePriceForRequest({
          requestorId: req.user._id,
          requestorOrgId: req.user?.businessAnchorId,
          clinicName,
          patientName,
          tooth,
        });
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

        // 유지홈(retentionGroove) — Draft → Request 승격 시 명시적으로 전달.
        // normalizedCi 스프레드만 의존하면 누락 위험이 있으므로 여기서 default("deep")
        // 까지 보장해 esprit-addin이 항상 유효한 값을 받도록 한다. (rules.md §7.4.1)
        const retentionGrooveValue = ci?.retentionGroove || "deep";

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
              surfaceTreatment: ci?.surfaceTreatment || "none",
              newSystemRequest,
              file: {
                originalName: ci.file.originalName,
                fileType: ci.file.mimetype,
                fileSize: ci.file.size,
                filePath: undefined,
                s3Key: ci.file.s3Key,
              },
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
              surfaceTreatment: ci?.surfaceTreatment || "none",
              newSystemRequest,
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

      const keyTuples = Array.from(tupleByKey.values());

      if (keyTuples.length > 0) {
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
          });
        }
        console.log("[createRequestsFromDraft] duplicate lookup done", {
          t: Date.now() - startTime,
          duplicates: duplicates.length,
        });
      }
      if (duplicates.length > 0 && !duplicateResolutions) {
        const first = duplicates[0];
        const st = String(first?.existingRequest?.manufacturerStage || "");
        const mode = st === "추적관리" ? "tracking" : "active";
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_REQUEST",
          message:
            st === "추적관리"
              ? "동일한 정보의 의뢰가 이미 완료되어 있습니다. 재의뢰(리메이크)로 접수할까요?"
              : "동일한 정보의 의뢰가 이미 진행 중입니다. 기존 의뢰를 취소하고 다시 의뢰할까요?",
          data: {
            mode,
            duplicates,
          },
        });
      }
    }

    const resolutionsByCaseId = new Map();
    const skipCaseIds = new Set();

    if (duplicates.length > 0 && duplicateResolutions) {
      for (const r of duplicateResolutions) {
        const strategy = String(r.strategy || "").trim();
        if (!strategy) continue;
        if (!["skip", "replace", "remake"].includes(strategy)) {
          return res.status(400).json({
            success: false,
            message: "유효하지 않은 duplicateResolutions.strategy 입니다.",
          });
        }
        if (strategy === "skip") {
          skipCaseIds.add(String(r.caseId));
          continue;
        }
        resolutionsByCaseId.set(String(r.caseId), {
          strategy,
          existingRequestId: String(r.existingRequestId || "").trim(),
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
          },
        });
      }

      const duplicatesByCaseId = new Map(
        duplicates.map((d) => [String(d.caseId || ""), d]),
      );
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
      }
    }

    const preparedCasesForCreate = preparedCases.filter(
      (c) => !skipCaseIds.has(String(c.caseId)),
    );

    if (preparedCasesForCreate.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "모든 중복 건이 기존 유지로 선택되어 신규 의뢰를 생성하지 않았습니다.",
        data: [],
      });
    }

    const totalSpendSupply = preparedCasesForCreate.reduce((acc, item) => {
      const n = Number(item?.computedPrice?.amount || 0);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);

    // Pre-fetch read-only data in parallel before transaction to minimize transaction duration
    const createdYmd = getTodayYmdInKst();
    const shippingOrgId = String(businessAnchorId || "");
    const [systemSettings, shippingOrg, estimatedShipYmd] = await Promise.all([
      SystemSettings.findOne().lean(),
      shippingOrgId && Types.ObjectId.isValid(shippingOrgId)
        ? BusinessAnchor.findById(shippingOrgId)
            .select({ "shippingPolicy.weeklyBatchDays": 1 })
            .lean()
        : Promise.resolve(null),
      addKoreanBusinessDays({ startYmd: createdYmd, days: 1 }),
    ]);
    const shippingFeePerBox = Number(
      systemSettings?.creditSettings?.shippingFee || 3500,
    );
    const weeklyBatchDays = Array.isArray(
      shippingOrg?.shippingPolicy?.weeklyBatchDays,
    )
      ? shippingOrg.shippingPolicy.weeklyBatchDays
      : [];
    const shipDate = estimatedShipYmd || createdYmd;
    const boxCount = 1;
    const totalShippingFee = boxCount * shippingFeePerBox;
    console.log("[createRequestsFromDraft] pre-fetch done", {
      t: Date.now() - startTime,
      shippingFeePerBox,
      weeklyBatchDays,
      shipDate,
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

    const session = await mongoose.startSession();
    try {
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

            const existingStage = String(
              existingDoc.manufacturerStage || "",
            ).trim();
            const stageOrder = {
              의뢰: 0,
              CAM: 1,
              생산: 2,
              발송: 3,
              추적관리: 4,
            };
            const currentStageOrder = stageOrder[existingStage] ?? 0;
            if (existingStage === "추적관리") {
              const err = new Error(
                "완료된 의뢰는 취소 후 재의뢰할 수 없습니다. 재의뢰(리메이크)로 진행해주세요.",
              );
              err.statusCode = 400;
              throw err;
            }
            if (currentStageOrder > 1) {
              const err = new Error(
                "생산 이후 단계에서는 기존 의뢰를 교체할 수 없습니다.",
              );
              err.statusCode = 400;
              throw err;
            }

            if (existingStage !== "취소") {
              existingDoc.manufacturerStage = "취소";
              await existingDoc.save({ session });
            }

            // 크레딧은 가공 단계에서 차감되므로 의뢰/CAM 단계에서는 환불할 것이 없음
            // Replace는 stageOrder < 2 (의뢰, CAM)에서만 허용되므로 환불 처리 불필요
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

        const { balance, paidCredit, bonusRequestCredit, bonusShippingCredit } =
          await getBusinessCreditBalanceBreakdown({
            businessAnchorId,
            session,
          });
        console.log("[createRequestsFromDraft] Credit balance check", {
          t: Date.now() - startTime,
          balance,
          paidCredit,
          bonusRequestCredit,
          bonusShippingCredit,
          requiredMachiningFee: totalSpendSupply,
        });

        console.log("[createRequestsFromDraft] Shipping fee calculation", {
          t: Date.now() - startTime,
          boxCount,
          shippingFeePerBox,
          totalShippingFee,
        });

        // 의뢰비 사용 가능 크레딧: paidCredit + bonusRequestCredit
        const availableForMachining = paidCredit + bonusRequestCredit;
        // 배송비 사용 가능 크레딧: paidCredit + bonusShippingCredit
        const availableForShipping = paidCredit + bonusShippingCredit;

        // 의뢰비 부족 체크
        const machiningShortfall =
          totalSpendSupply > availableForMachining
            ? totalSpendSupply - availableForMachining
            : 0;
        // 배송비 부족 체크
        const shippingShortfall =
          totalShippingFee > availableForShipping
            ? totalShippingFee - availableForShipping
            : 0;

        if (machiningShortfall > 0 || shippingShortfall > 0) {
          let message = "";
          const details = [];

          if (machiningShortfall > 0 && shippingShortfall > 0) {
            message = "의뢰비와 배송비 크레딧이 모두 부족합니다.";
            details.push(
              `의뢰비 필요: ${totalSpendSupply.toLocaleString()}원 (보유: ${availableForMachining.toLocaleString()}원)`,
            );
            details.push(
              `배송비 필요: ${totalShippingFee.toLocaleString()}원 (보유: ${availableForShipping.toLocaleString()}원)`,
            );
          } else if (machiningShortfall > 0) {
            message = "의뢰비 크레딧이 부족합니다.";
            details.push(
              `필요: ${totalSpendSupply.toLocaleString()}원, 보유: ${availableForMachining.toLocaleString()}원`,
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

          const err = new Error(message);
          err.statusCode = 402;
          err.payload = {
            machiningFee: {
              required: totalSpendSupply,
              available: availableForMachining,
              shortfall: machiningShortfall,
            },
            shippingFee: {
              required: totalShippingFee,
              available: availableForShipping,
              shortfall: shippingShortfall,
              boxCount,
              feePerBox: shippingFeePerBox,
            },
            reason: "insufficient_credit",
          };
          throw err;
        }

        const dupsByCaseId = new Map(
          duplicates.map((d) => [String(d.caseId || ""), d]),
        );

        const { calculateInitialProductionSchedule } =
          await import("./production.utils.js");

        const requestIds = await generateRequestIdBatch(
          preparedCasesForCreate.length,
          session,
        );
        const requestDocs = [];

        for (const [index, item] of preparedCasesForCreate.entries()) {
          const shippingMode = item.shippingMode || "normal";
          const requestedAt = new Date();
          const requestedShipDate = item.requestedShipDate || undefined;
          const requestId = requestIds[index];

          const newRequest = {
            requestId,
            requestor: req.user._id,
            businessAnchorId:
              req.user?.role === "requestor" && req.user?.businessAnchorId
                ? req.user.businessAnchorId
                : null,
            price: item.computedPrice,
            shippingMode,
            requestedShipDate,
            caseInfos: item.caseInfosWithFile,
            manufacturerStage: "의뢰",
          };

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

          const productionSchedule = await calculateInitialProductionSchedule({
            shippingMode,
            maxDiameter: item.caseInfosWithFile?.maxDiameter,
            requestedAt,
            weeklyBatchDays:
              shippingMode === "normal" ? requestorWeeklyBatchDays : [],
          });
          newRequest.productionSchedule = productionSchedule;

          const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
          const pickupYmdRaw = productionSchedule?.scheduledShipPickup
            ? toKstYmd(productionSchedule.scheduledShipPickup)
            : null;
          if (pickupYmdRaw) {
            const pickupYmd = await normalizeKoreanBusinessDay({
              ymd: pickupYmdRaw,
            });
            newRequest.timeline = newRequest.timeline || {};
            newRequest.timeline.originalEstimatedShipYmd = pickupYmd;
            newRequest.timeline.nextEstimatedShipYmd = pickupYmd;
            newRequest.timeline.estimatedShipYmd = pickupYmd;
          } else {
            // Use manufacturer lead times based on diameter
            const { getManufacturerLeadTimesUtil } =
              await import("../businesses/leadTime.controller.js");
            const manufacturerSettings = await getManufacturerLeadTimesUtil();
            const leadTimes = manufacturerSettings?.leadTimes || {};

            const maxD = item.caseInfosWithFile?.maxDiameter;
            const d = typeof maxD === "number" && !isNaN(maxD) ? maxD : 8;
            let diameterKey = "d8";
            if (d <= 6) diameterKey = "d6";
            else if (d <= 8) diameterKey = "d8";
            else if (d <= 10) diameterKey = "d10";
            else diameterKey = "d12";

            const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;

            const estimatedShipYmdRaw = await addKoreanBusinessDays({
              startYmd: createdYmd,
              days: leadDays,
            });
            const estimatedShipYmd = await normalizeKoreanBusinessDay({
              ymd: estimatedShipYmdRaw,
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

          requestDocs.push(newRequest);
        }

        const insertedRequests = await Request.insertMany(requestDocs, {
          session,
        });
        insertedRequests.forEach((doc) => createdRequests.push(doc));
      });
      console.log("[createRequestsFromDraft] transaction done", {
        t: Date.now() - startTime,
        created: createdRequests.length,
      });

      // [트리거] 트랜잭션 커밋 후 rhino-server에 fill hole 처리 시작을 알린다 (fire-and-forget).
      // 의뢰별로 STL이 있으면 각각 트리거. 실패해도 의뢰 생성은 그대로 성공 응답된다.
      try {
        const { triggerRhinoProcessFileForRequest } =
          await import("../rhino/rhino.controller.js");
        for (const doc of createdRequests) {
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
      if (createdAnchorId) {
        console.log("[createRequestsFromDraft] Triggering dashboard refresh", {
          businessAnchorId: createdAnchorId,
          createdCount: createdRequests.length,
          requestIds: createdRequests.map((r) => r.requestId),
        });
        triggerDashboardSummaryRefreshForAnchorId(
          createdAnchorId,
          "request-created",
        ).catch((err) =>
          console.error(
            "[createRequestsFromDraft] dashboard refresh error",
            err,
          ),
        );
        // bulk shipping은 요약 스냅샷과 분리된 materialized snapshot이므로 별도로 갱신한다.
        recomputeBulkShippingSnapshotForBusinessAnchorId(createdAnchorId).catch(
          (err) =>
            console.error(
              "[createRequestsFromDraft] bulk shipping snapshot error",
              err,
            ),
        );
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
      session.endSession();
    }

    console.log("[createRequestsFromDraft] response", {
      t: Date.now() - startTime,
      created: createdRequests.length,
    });
    return res.status(201).json({
      success: true,
      message: `${createdRequests.length}건의 의뢰가 Draft에서 생성되었습니다.`,
      data: createdRequests,
      ...(missingFieldsByFile.length > 0 && {
        warning: `${missingFieldsByFile.length}개 파일은 필수 정보 누락으로 제외되었습니다.`,
        missingFiles: missingFieldsByFile,
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
