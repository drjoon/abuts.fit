import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import Request from "../../models/request.model.js";
import DraftRequest from "../../models/draftRequest.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import {
  normalizeCaseInfosImplantFields,
  computePriceForRequest,
  canAccessRequestAsRequestor,
  buildRequestorOrgScopeFilter,
  addKoreanBusinessDays,
  normalizeKoreanBusinessDay,
  getTodayYmdInKst,
  ensureLotNumberForMachining,
  toKstYmd,
  getRequestorOrgId,
} from "./utils.js";
import { checkCreditLock } from "../../utils/creditLock.util.js";
import {
  buildStandardStlFileName,
  getOrganizationCreditBalanceBreakdown,
  isDuplicateKeyError,
  uploadS3ToRhinoServer,
} from "./creation.helpers.controller.js";

const REQUEST_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const REQUEST_ID_SUFFIX_LEN = 8;
const REQUEST_ID_MAX_TRIES = 8;

const buildRequestIdPrefix = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
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
 * DraftRequest를 실제 Request들로 변환
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
    const duplicateResolutionsRaw = Array.isArray(
      req.body?.duplicateResolutions,
    )
      ? req.body.duplicateResolutions
      : null;
    const duplicateResolutions = Array.isArray(duplicateResolutionsRaw)
      ? duplicateResolutionsRaw
          .filter((r) => r && typeof r === "object")
          .map((r) => ({
            caseId: String(r.caseId || "").trim(),
            strategy: String(r.strategy || "").trim(),
            existingRequestId: String(r.existingRequestId || "").trim(),
          }))
          .filter((r) => r.caseId && r.strategy)
      : null;

    if (!draftId || !Types.ObjectId.isValid(draftId)) {
      return res.status(400).json({
        success: false,
        message: "유효한 draftId가 필요합니다.",
      });
    }

    const draft = await DraftRequest.findById(draftId).lean();
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
      const orgId = getRequestorOrgId(req);
      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
        });
      }

      // 크레딧 lock 체크
      const lockStatus = await checkCreditLock(orgId);
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
        const normalizedCi = await normalizeCaseInfosImplantFields(ci || {});
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

        const missing = [];
        if (!clinicName) missing.push("치과이름");
        if (!patientName) missing.push("환자이름");

        if (missing.length > 0) {
          const fileName = ci?.file?.originalName || `파일 ${idx + 1}`;
          return {
            skip: true,
            fileName,
            missingFields: missing,
          };
        }

        const priceStart = Date.now();
        const computedPrice = await computePriceForRequest({
          requestorId: req.user._id,
          requestorOrgId: req.user?.organizationId,
          clinicName,
          patientName,
          tooth,
        });
        console.log("[createRequestsFromDraft] compute price", {
          t: Date.now() - startTime,
          idx,
          dt: Date.now() - priceStart,
        });

        const caseInfosWithFile = ci?.file
          ? {
              ...normalizedCi,
              file: {
                originalName: ci.file.originalName,
                fileType: ci.file.mimetype,
                fileSize: ci.file.size,
                filePath: undefined,
                s3Key: ci.file.s3Key,
                s3Url: undefined,
              },
            }
          : normalizedCi;

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

    const organizationId = req.user?.organizationId;
    if (!organizationId || !Types.ObjectId.isValid(String(organizationId))) {
      return res.status(403).json({
        success: false,
        message:
          "기공소 소속 정보가 필요합니다. 설정 > 기공소에서 소속을 먼저 확인해주세요.",
      });
    }

    console.log("[createRequestsFromDraft] normalize cases done", {
      t: Date.now() - startTime,
      preparedCount: preparedCases.length,
      missingCount: missingFieldsByFile.length,
    });
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const duplicates = [];

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

        const existingCi = existing?.caseInfos || {};

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

            const existingDoc =
              await Request.findById(existingRequestId).session(session);
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

            const refundAmount = Number(existingDoc?.price?.amount || 0);
            if (refundAmount > 0) {
              const refundKey = `request:${String(
                existingDoc._id,
              )}:case:${String(caseId)}:replace_refund`;
              await CreditLedger.updateOne(
                { uniqueKey: refundKey },
                {
                  $setOnInsert: {
                    organizationId,
                    userId: req.user?._id || null,
                    type: "REFUND",
                    amount: refundAmount,
                    refType: "REQUEST",
                    refId: existingDoc._id,
                    uniqueKey: refundKey,
                  },
                },
                { upsert: true, session },
              );
            }
          }

          for (const [caseId, r] of resolutionsByCaseId.entries()) {
            const strategy = String(r?.strategy || "").trim();
            if (strategy !== "remake") continue;
            const existingRequestId = String(r?.existingRequestId || "").trim();
            if (!existingRequestId) continue;

            const existingDoc = await Request.findById(existingRequestId)
              .select({
                _id: 1,
                manufacturerStage: 1,
                "caseInfos.reviewByStage.shipping.status": 1,
              })
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
            const shippingReviewStatus = String(
              existingDoc?.caseInfos?.reviewByStage?.shipping?.status || "",
            ).trim();
            if (shippingReviewStatus !== "APPROVED") {
              const err = new Error(
                "진행 중인 의뢰는 재의뢰(리메이크)로 처리할 수 없습니다. 기존 의뢰를 취소하고 재의뢰로 진행해주세요.",
              );
              err.statusCode = 400;
              throw err;
            }
          }
        }

        const { balance } = await getOrganizationCreditBalanceBreakdown({
          organizationId,
          session,
        });
        console.log("[createRequestsFromDraft] credit check", {
          t: Date.now() - startTime,
          balance,
          required: totalSpendSupply,
        });

        if (balance < totalSpendSupply) {
          const err = new Error("크레딧이 부족합니다.");
          err.statusCode = 402;
          err.payload = { balance, required: totalSpendSupply };
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
            requestorOrganizationId:
              req.user?.role === "requestor" && req.user?.organizationId
                ? req.user.organizationId
                : null,
            price: item.computedPrice,
            shippingMode,
            requestedShipDate,
            caseInfos: item.caseInfosWithFile,
            manufacturerStage: "의뢰",
          };

          await ensureLotNumberForMachining(newRequest);

          newRequest.originalShipping = {
            mode: shippingMode,
            requestedAt,
          };

          newRequest.finalShipping = {
            mode: shippingMode,
            updatedAt: requestedAt,
          };

          const productionSchedule = await calculateInitialProductionSchedule({
            shippingMode,
            maxDiameter: item.caseInfosWithFile?.maxDiameter,
            requestedAt,
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
            newRequest.timeline.estimatedShipYmd = pickupYmd;
          } else {
            const maxD = item.caseInfosWithFile?.maxDiameter;
            const isSmall =
              typeof maxD === "number" && !Number.isNaN(maxD)
                ? maxD <= 8
                : true;
            const days = shippingMode === "express" ? (isSmall ? 1 : 4) : 0;
            const estimatedShipYmdRaw =
              shippingMode === "express"
                ? await addKoreanBusinessDays({ startYmd: createdYmd, days })
                : await normalizeKoreanBusinessDay({ ymd: createdYmd });
            const estimatedShipYmd = await normalizeKoreanBusinessDay({
              ymd: estimatedShipYmdRaw,
            });
            newRequest.timeline = newRequest.timeline || {};
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

            uploadS3ToRhinoServer(s3Key, bgFileName).catch((err) => {
              console.error(
                `[Rhino-Parallel-Upload] Failed for request ${requestId}: ${err.message}`,
              );
            });
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
    } catch (e) {
      const statusCode = Number(e?.statusCode || 0);
      if (statusCode === 402) {
        return res.status(402).json({
          success: false,
          message: "크레딧이 부족합니다. 크레딧을 충전한 뒤 다시 시도해주세요.",
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
